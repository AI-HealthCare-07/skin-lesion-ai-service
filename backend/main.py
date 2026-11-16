from datetime import date, datetime
import json
import os
import shutil
import uuid
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import redis
from sqlalchemy.orm import Session

from backend import models
from backend.database import Base, SessionLocal, engine, get_db

load_dotenv()

# 1. MySQL 테이블 자동 생성 및 업로드 폴더 준비
Base.metadata.create_all(bind=engine)
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = FastAPI(title="MediGuide AI API", version="0.2.0")

# 2. CORS 보안 설정
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS", "http://127.0.0.1:5500,http://localhost:3000"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

# 3. Redis 보안 연결
REDIS_HOST = os.getenv("REDIS_HOST", "127.0.0.1")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD")

if not REDIS_PASSWORD:
    raise RuntimeError("REDIS_PASSWORD is missing in .env")

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

    # (1) 이미지 로컬 저장 (업로드 안 했을 경우 더미 경로 지정)
    if image and image.filename:
        ext = os.path.splitext(image.filename)[1] or ".jpg"
        saved_filename = f"{uuid.uuid4()}{ext}"
        saved_path = os.path.join(UPLOAD_DIR, saved_filename)
        with open(saved_path, "wb") as buffer:
            shutil.copyfileobj(image.file, buffer)
    else:
        saved_path = "uploads/sample_lesion.jpg"

    symptom_list = [s.strip() for s in symptoms.split(",") if s.strip()]
    med_list = [m.strip() for m in current_medications.split(",") if m.strip()]

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