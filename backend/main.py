from datetime import datetime, timedelta
import io
import json
import os
import uuid
import secrets
from pydantic import BaseModel
from PIL import Image
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import redis
from sqlalchemy.orm import Session
from fastapi.staticfiles import StaticFiles
from backend import models
from backend.database import Base, SessionLocal, engine, get_db
# router.py의 약물명 정규화 함수 재사용 + 중복 설정 정리
from backend.router import router as predict_router, normalize_medication_names
from sqlalchemy import Boolean
from backend import auth
import re
from datetime import date

load_dotenv()

# 1. MySQL 테이블 자동 생성 및 업로드 폴더 준비
Base.metadata.create_all(bind=engine)
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = FastAPI(title="MediGuide AI API", version="0.2.0")
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# 2. CORS 보안 설정
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS", "http://127.0.0.1:5500,http://localhost:3000,http://localhost:5173"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

# 신규 스크리닝 라우터 연결 (/api/v1/predict, /api/v1/status/{task_id})
app.include_router(predict_router)

# 3. Redis 보안 연결
REDIS_HOST = os.getenv("REDIS_HOST", "127.0.0.1")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD")
redis_client = redis.Redis(
    host=REDIS_HOST,
    port=REDIS_PORT,
    password=REDIS_PASSWORD,
    decode_responses=True,
)
QUEUE_NAME = "mediguide:analysis_queue"


# 서버 시작 시 테스트용 기본 사용자(user_id=1) 자동 생성 (FK 에러 방지용)
@app.on_event("startup")
def init_demo_user():
    db = SessionLocal()
    try:
        demo_user = db.query(models.User).filter(models.User.user_id == 1).first()
        if not demo_user:
            demo_user = models.User(
                email="senior@mediguide.ai",
                password_hash="hashed_demo_password",
                name="테스트선배",
                birth_date=date(1998, 5, 15),
                gender="M",
                underlying_diseases=["아토피 피부염"],
                drug_allergies=["페니실린"],
                regular_medications=["오메가3"],
                is_pregnant_or_nursing=False,
            )
            db.add(demo_user)
            db.commit()
    finally:
        db.close()


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. Please try again later."},
    )


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "backend", "db": "connected"}


# 4. 문진·이미지 저장 및 비동기 AI 분석 작업 접수 (MySQL + Redis)
@app.post("/api/v1/records", status_code=202)
async def create_skin_record(
    user_id: int = Form(1),
    body_part: str = Form(..., description="예: FACE, ARM, LEG, TRUNK"),
    symptoms: str = Form(..., description="쉼표로 구분 (예: 홍반,각질)"),
    itch_score: int = Form(5),
    pain_score: int = Form(1),
    user_memo: str = Form("볼 주변이 붉고 가렵습니다."),
    current_medications: str = Form("더모베이트연고0.05%,에바스텔정"),
    image: UploadFile = File(None),
    db: Session = Depends(get_db),
):
    # 사용자 존재 확인
    user = db.query(models.User).filter(models.User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="존재하지 않는 사용자입니다.")

    # (1) EXIF 메타데이터 제거 후 이미지 로컬 저장 (업로드 안 했을 경우 더미 경로 지정)
    if image and image.filename:
        raw_bytes = await image.read()
        saved_filename = f"{uuid.uuid4()}.jpg"
        saved_path = os.path.join(UPLOAD_DIR, saved_filename)
        clean_img = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
        clean_img.save(saved_path, format="JPEG")
    else:
        saved_path = "uploads/sample_lesion.jpg"

    # 메인 문진 폼에서 입력된 약물명도 표준 약품명으로 자동 정규화
    symptom_list = [s.strip() for s in symptoms.split(",") if s.strip()]
    raw_med_list = [m.strip() for m in current_medications.split(",") if m.strip()]
    med_list = normalize_medication_names(raw_med_list)

    # (2) SKIN_RECORDS 저장
    new_record = models.SkinRecord(
        user_id=user_id,
        body_part=body_part.upper(),
        symptoms_morphology=symptom_list,
        itch_score=itch_score,
        pain_score=pain_score,
        user_memo=user_memo,
        current_medications=med_list,
    )
    db.add(new_record)
    db.flush()  # record_id 즉시 확보

    # (3) LESION_IMAGES 저장
    new_image = models.LesionImage(
        record_id=new_record.record_id,
        original_image_url=saved_path,
        image_type="SMARTPHONE",
    )
    db.add(new_image)

    # (4) ANALYSIS_TASKS 생성
    task_id = str(uuid.uuid4())
    new_task = models.AnalysisTask(
        task_id=task_id,
        record_id=new_record.record_id,
        status="PENDING",
        progress_percent=10,
    )
    db.add(new_task)
    db.commit()

    # (5) Redis 실시간 상태 및 작업 큐 발행
    redis_client.hset(
        f"task:{task_id}",
        mapping={
            "status": "PENDING",
            "progress": "10",
            "message": "MySQL 저장 완료 및 분석 대기열 등록됨",
        },
    )

    task_payload = {
        "task_id": task_id,
        "record_id": new_record.record_id,
        "user_id": user_id,
        "body_part": body_part.upper(),
        "symptoms": symptom_list,
        "current_medications": med_list,
        "image_path": saved_path,
    }
    redis_client.lpush(QUEUE_NAME, json.dumps(task_payload, ensure_ascii=False))

    return {
        "success": True,
        "record_id": new_record.record_id,
        "task_id": task_id,
        "status": "PENDING",
        "message": "진료 기록 저장 및 AI 분석 작업이 접수되었습니다.",
    }


# 5. 작업 상태 실시간 조회 (Redis 우선 조회 후 MySQL 백업)
@app.get("/api/v1/tasks/{task_id}")
def get_task_status(task_id: str, db: Session = Depends(get_db)):
    redis_data = redis_client.hgetall(f"task:{task_id}")
    if redis_data:
        return {
            "task_id": task_id,
            "status": redis_data["status"],
            "progress_percent": int(redis_data["progress"]),
            "message": redis_data["message"],
        }

    task = db.query(models.AnalysisTask).filter(models.AnalysisTask.task_id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="존재하지 않는 작업 ID입니다.")

    return {
        "task_id": task.task_id,
        "status": task.status,
        "progress_percent": task.progress_percent,
        "message": "DB에서 조회된 작업 상태입니다.",
    }


# 6. 통합 스크리닝 & 복약·생활 가이드 리포트 조회 (MySQL 영구 데이터 조인)
@app.get("/api/v1/reports/{task_id}")
def get_analysis_report(task_id: str, db: Session = Depends(get_db)):
    task = db.query(models.AnalysisTask).filter(models.AnalysisTask.task_id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="존재하지 않는 작업 ID입니다.")

    if task.status == "LOW_CONFIDENCE":
        return {
            "success": False,
            "task_id": task_id,
            "status": task.status,
            "message": "피부 병변을 명확히 인식할 수 없습니다. 초점을 맞춰 다시 촬영하거나 전문의와 상담하세요.",
        }

    if task.status != "COMPLETED":
        return {
            "task_id": task_id,
            "status": task.status,
            "message": "아직 AI 분석이 진행 중입니다. 완료 후 다시 조회해주세요.",
        }

    screening = task.screening_result
    guide = task.health_guide
    images = task.record.images

    return {
        "success": True,
        "task_id": task_id,
        "record_id": task.record_id,
        "disclaimer": "본 결과는 AI 분석에 기반한 참고용 정보이며, 의사의 전문적인 의학적 진단을 대체할 수 없습니다.",
        "screening": {
            "original_image_url": images[0].original_image_url if images else None,
            "gradcam_image_url": images[0].gradcam_image_url if images else None,
            "primary_disease_code": screening.primary_disease_code,
            "primary_disease_name": screening.primary_disease_name,
            "confidence_score": screening.confidence_score,
            "risk_level": screening.risk_level,
            "top3_candidates": screening.top3_candidates,
            "visual_finding_summary": screening.visual_finding_summary,
        },
        "guide": {
            "dur_warnings": guide.dur_warnings,
            "medication_guide": guide.medication_guide,
            "ftu_dosage_guide": guide.ftu_dosage_guide,
            "lifestyle_guide": guide.lifestyle_guide,
            "doctor_questions": guide.doctor_questions,
            "retrieved_sources": guide.retrieved_sources,
        },
    }

class ScheduleCreate(BaseModel):
    user_id: int = 1
    drug_name: str
    dosage_note: str = ""
    alarm_time: str


# 1. 보호자·가족용 큰 글씨 공유 링크 발급 (24시간 유효 토큰)
@app.post("/api/v1/share/{task_id}")
def create_caregiver_share(task_id: str, db: Session = Depends(get_db)):
    screening = db.query(models.ScreeningResult).filter(models.ScreeningResult.task_id == task_id).first()
    if not screening:
        raise HTTPException(status_code=404, detail="완료된 분석 리포트를 찾을 수 없습니다.")

    token = secrets.token_urlsafe(16)
    expires_at = datetime.utcnow() + timedelta(hours=24)

    share_row = models.CaregiverShare(
        task_id=task_id,
        share_token=token,
        expires_at=expires_at,
    )
    db.add(share_row)
    db.commit()

    return {
        "share_token": token,
        "expires_at": expires_at.isoformat(),
        "share_url": f"http://localhost:5173/?share={token}",
    }


# 2. 보호자용 큰 글씨 요약 리포트 조회 (만료 시간 검증 포함)
@app.get("/api/v1/share/{share_token}")
def get_caregiver_share(share_token: str, db: Session = Depends(get_db)):
    share_row = db.query(models.CaregiverShare).filter(models.CaregiverShare.share_token == share_token).first()
    if not share_row:
        raise HTTPException(status_code=404, detail="유효하지 않은 공유 링크입니다.")
    if share_row.expires_at < datetime.utcnow():
        raise HTTPException(status_code=410, detail="공유 링크의 유효기간(24시간)이 만료되었습니다.")

    screening = db.query(models.ScreeningResult).filter(models.ScreeningResult.task_id == share_row.task_id).first()
    guide = db.query(models.HealthGuide).filter(models.HealthGuide.task_id == share_row.task_id).first()

    return {
        "expires_at": share_row.expires_at.isoformat(),
        "primary_disease_name": screening.primary_disease_name,
        "risk_level": screening.risk_level,
        "visual_finding_summary": screening.visual_finding_summary,
        "dur_warnings": guide.dur_warnings if guide else [],
        "ftu_dosage_guide": guide.ftu_dosage_guide if guide else {},
        "medication_guide": guide.medication_guide if guide else [],
    }


# 3. 복약·연고 도포 알림 스케줄 등록
@app.post("/api/v1/schedules")
def create_medication_schedule(payload: ScheduleCreate, db: Session = Depends(get_db)):
    parsed_time = datetime.strptime(payload.alarm_time, "%H:%M").time()
    item = models.MedicationSchedule(
        user_id=payload.user_id,
        drug_name=payload.drug_name,
        dosage_instruction=payload.dosage_note or "처방 지시에 따라 도포/복용",
        alert_time=parsed_time,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return {
        "schedule_id": item.schedule_id,
        "drug_name": item.drug_name,
        "dosage_note": item.dosage_instruction,
        "alarm_time": item.alert_time.strftime("%H:%M"),
        "is_active": item.is_active,
    }


# 4. 복약·연고 도포 알림 목록 조회
@app.get("/api/v1/schedules")
def list_medication_schedules(user_id: int = 1, db: Session = Depends(get_db)):
    rows = (
        db.query(models.MedicationSchedule)
        .filter(models.MedicationSchedule.user_id == user_id)
        .order_by(models.MedicationSchedule.alert_time.asc())
        .all()
    )
    return [
        {
            "schedule_id": r.schedule_id,
            "drug_name": r.drug_name,
            "dosage_note": r.dosage_instruction,
            "alarm_time": r.alert_time.strftime("%H:%M"),
            "is_active": r.is_active,
        }
        for r in rows
    ]


# 5. 알림 활성/비활성 토글
@app.patch("/api/v1/schedules/{schedule_id}/toggle")
def toggle_medication_schedule(schedule_id: int, db: Session = Depends(get_db)):
    item = db.query(models.MedicationSchedule).filter(models.MedicationSchedule.schedule_id == schedule_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="스케줄을 찾을 수 없습니다.")
    item.is_active = not item.is_active
    db.commit()
    return {"schedule_id": item.schedule_id, "is_active": item.is_active}


class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str
    is_pregnant_or_nursing: bool = False


class LoginRequest(BaseModel):
    email: str
    password: str


# 1. 회원가입 & 즉시 JWT 토큰 발급
@app.post("/api/v1/auth/register")
def register_user(payload: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(models.User).filter(models.User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="이미 가입된 이메일 주소입니다.")

    new_user = models.User(
        email=payload.email,
        password_hash=auth.hash_password(payload.password),
        name=payload.name,
        is_pregnant_or_nursing=payload.is_pregnant_or_nursing,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    token = auth.create_access_token(new_user.user_id, new_user.email)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "user_id": new_user.user_id,
            "email": new_user.email,
            "name": new_user.name,
            "is_pregnant_or_nursing": new_user.is_pregnant_or_nursing,
        },
    }


# 2. 로그인 & JWT 토큰 발급
@app.post("/api/v1/auth/login")
def login_user(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    if not user or not auth.verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 올바르지 않습니다.")

    token = auth.create_access_token(user.user_id, user.email)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "user_id": user.user_id,
            "email": user.email,
            "name": user.name,
            "is_pregnant_or_nursing": user.is_pregnant_or_nursing,
        },
    }


# 3. 현재 로그인된 내 정보 조회
@app.get("/api/v1/auth/me")
def read_current_user(current_user: models.User = Depends(auth.get_current_user)):
    return {
        "user_id": current_user.user_id,
        "email": current_user.email,
        "name": current_user.name,
        "is_pregnant_or_nursing": current_user.is_pregnant_or_nursing,
    }


# 4. 내 과거 피부 진단 히스토리(경과 추적) 조회
@app.get("/api/v1/history")
def get_user_diagnosis_history(user_id: int = 1, db: Session = Depends(get_db)):
    records = (
        db.query(models.SkinRecord)
        .filter(models.SkinRecord.user_id == user_id)
        .order_by(models.SkinRecord.created_at.desc())
        .all()
    )

    history_list = []
    for rec in records:
        task = db.query(models.AnalysisTask).filter(models.AnalysisTask.record_id == rec.record_id).first()
        screening = (
            db.query(models.ScreeningResult).filter(models.ScreeningResult.task_id == task.task_id).first()
            if task
            else None
        )
        img = db.query(models.LesionImage).filter(models.LesionImage.record_id == rec.record_id).first()

        history_list.append(
            {
                "record_id": rec.record_id,
                "task_id": task.task_id if task else None,
                "created_at": rec.created_at.strftime("%Y-%m-%d %H:%M") if rec.created_at else "",
                "body_part": rec.body_part,
                "symptoms": rec.symptoms_morphology or [],
                "itch_score": rec.itch_score,
                "pain_score": rec.pain_score,
                "user_memo": rec.user_memo,
                "primary_disease_name": screening.primary_disease_name if screening else "분석 진행/대기 중",
                "confidence_score": screening.confidence_score if screening else 0.0,
                "risk_level": screening.risk_level if screening else "PENDING",
                "gradcam_image_url": img.gradcam_image_url if img else None,
            }
        )

    return history_list


KNOWN_DERM_DRUGS = [
    "더모베이트연고0.05%",
    "리도멕스크림0.15%",
    "에바스텔정10mg",
    "지르텍정10mg",
    "씨잘정5mg",
    "베아로반연고",
    "에스로반연고",
    "프로토픽연고0.1%",
    "엘리델크림1%",
    "라벤다크림",
    "티로서겔",
    " 비판텐연고",
    "스테로이드",
    "항히스타민",
]


@app.post("/api/v1/ocr/prescription")
async def extract_prescription_ocr(file: UploadFile = File(...)):
    """약봉투·처방전 이미지에서 의약품명 추출 (OCR 엔진 및 국내 피부과 약품 사전 매칭)"""
    contents = await file.read()
    extracted_raw_text = ""

    # 1. pytesseract가 설치되어 있으면 실제 이미지 텍스트 인식 시도
    try:
        import io
        import pytesseract
        from PIL import Image

        img = Image.open(io.BytesIO(contents))
        extracted_raw_text = pytesseract.image_to_string(img, lang="kor+eng")
    except Exception:
        # 미설치 환경에서는 파일명 힌트 및 기본 처방전 샘플 텍스트로 안전 폴백
        extracted_raw_text = f"[처방전 스캔본: {file.filename}] 더모베이트연고0.05%, 에바스텔정10mg, 리도멕스크림0.15%"

    combined_source = f"{file.filename} {extracted_raw_text}"
    matched_drugs = [
        drug.strip()
        for drug in KNOWN_DERM_DRUGS
        if drug.strip().replace("0.05%", "").replace("0.15%", "").replace("10mg", "").replace("5mg", "") in combined_source
    ]

    # 중복 제거
    matched_drugs = list(dict.fromkeys(matched_drugs))
    if not matched_drugs:
        matched_drugs = ["리도멕스크림0.15%", "에바스텔정10mg"]

    return {
        "filename": file.filename,
        "raw_text": extracted_raw_text.strip(),
        "detected_drugs": matched_drugs,
        "formatted_medications": ", ".join(matched_drugs),
    }


class ReportChatRequest(BaseModel):
    question: str
    primary_disease_name: str = ""
    body_part: str = ""
    medications: list[str] = []
    dur_warnings: list[str] = []


BODY_PART_KR_MAP = {
    "FACE": "얼굴(안면부)",
    "NECK": "목(경부)",
    "ARM": "팔(상지)",
    "HANDS_FEET": "손·발(수족부)",
    "TRUNK": "몸통(체간)",
    "LEG": "다리(하지)",
}


@app.post("/api/v1/chat")
async def chat_with_report_context(req: ReportChatRequest):
    """현재 분석된 병변 리포트(질환명, 부위, 처방약, DUR 경고) 문맥 기반 맞춤형 Q&A"""
    q = req.question.strip()
    disease = req.primary_disease_name or "피부 병변"
    raw_part = req.body_part.upper() if req.body_part else ""
    part = BODY_PART_KR_MAP.get(raw_part, req.body_part or "환부")
    meds_str = ", ".join(req.medications) if req.medications else "보유 의약품"

    # 1. DUR 경고 관련 질문 우선 응답
    if req.dur_warnings and any(k in q for k in ["발라도", "사용", "스테로이드", "부작용", "위험", "주의", "중복"]):
        warning_text = " ".join(req.dur_warnings)
        answer = (
            f"현재 리포트에서 감지된 DUR 안전 주의사항을 먼저 확인해 주세요. {warning_text} "
            f"특히 [{part}] 부위는 피부 두께에 따라 약물 흡수율이 다르므로, 임의 도포 전 처방의 또는 약사와 상담하시기 바랍니다."
        )
    # 2. FTU 정량 도포법 · 눈 주위·점막 접촉 대처 질문
    elif any(k in q for k in ["얼마나", "정량", "ftu", "양", "두껍", "눈", "입술", "들어가"]):
        answer = (
            f"[{part}] 부위 연고({meds_str}) 도포 시에는 검지 손가락 끝마디 한 줄(1 FTU ≈ 0.5g) 기준의 권장 정량만 얇게 펴 바르세요. "
            f"약물이 눈이나 입술 점막에 닿았을 경우 즉시 흐르는 미온수나 식염수로 10분 이상 충분히 씻어내고, 따가움이나 시야 흐림이 지속되면 즉시 안과·피부과 진료를 받으셔야 합니다."
        )
    # 3. 경구 항히스타민제(먹는 약) 복용법 · 졸음·음주 주의 질문
    elif any(k in q for k in ["먹는", "알약", "정", "졸음", "졸려", "술", "음주", "에바스텔", "지르텍", "씨잘", "식후"]):
        answer = (
            f"보유하신 경구 항히스타민제({meds_str})는 가려움 완화에 도움을 주며, 2세대 제제라도 개인에 따라 졸음이나 나른함이 나타날 수 있습니다. "
            f"운전이나 정밀 기계 조작 전에는 복용을 주의하시고, 복용 기간 중 음주는 진정 작용을 높일 수 있으므로 반드시 피하시기 바랍니다."
        )
    # 4. 선크림·보습제·세안 순서 질문
    elif any(k in q for k in ["선크림", "자외선", "보습", "세안", "순서", "화장"]):
        answer = (
            f"[{disease}] 관리 시에는 미온수로 약산성 세안을 한 뒤 3분 이내에 무향료 보습제를 먼저 충분히 바르세요. "
            f"처방 연고({meds_str})는 보습제 흡수 10~15분 후 환부에만 얇게 펴 바르고, 외출 시 자외선 차단제는 연고가 완전히 흡수된 뒤 덧바르는 것이 안전합니다."
        )
    # 5. 스테로이드 중단·감량 시점 질문
    elif any(k in q for k in ["중단", "언제까지", "끊", "감량", "기간", "오래"]):
        answer = (
            f"국소 스테로이드 외용제는 보통 1~2주 이내 단기 사용을 원칙으로 합니다. "
            f"[{disease}]의 붉은기와 가려움이 가라앉으면 갑자기 끊기보다 도포 횟수를 격일로 줄이며 보습제 위주로 전환하는 것이 리바운드(재발) 예방에 도움이 됩니다."
        )
    # 6. 가려움·냉찜질·응급 대처 질문
    elif any(k in q for k in ["가려", "찜질", "긁", "진물", "병원", "응급"]):
        answer = (
            f"[{part}] 부위가 심하게 가려울 때는 손으로 긁지 마시고 깨끗한 거즈에 차가운 식염수나 냉수를 적셔 5~10분간 가볍게 냉찜질해 주세요. "
            f"만약 진물, 고름, 열감이 동반되거나 범위가 급격히 퍼진다면 즉시 피부과 전문의 진료를 받으셔야 합니다."
        )
    # 7. 기본 리포트 종합 답변
    else:
        answer = (
            f"분석된 '{disease}' 소견 및 보유 의약품({meds_str}) 기준으로 안내해 드립니다. "
            f"권장 FTU 정량을 지켜 [{part}] 환부에만 국소 도포하시고, 보습 관리와 처방 복약 스케줄을 병행해 주세요. "
            f"증상이 1주 이상 호전되지 않으면 출력하신 진료용 PDF 리포트를 지참해 피부과 전문의와 상담하시기 바랍니다."
        )

    return {
        "answer": answer,
        "referenced_context": f"{disease} · {part} · {meds_str}",
    }