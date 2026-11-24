import difflib
import re
import os
import io
import uuid
import json
from PIL import Image
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from sqlalchemy.orm import Session
import redis.asyncio as redis
from dotenv import load_dotenv

from backend.database import SessionLocal
from backend import models

load_dotenv()

router = APIRouter(prefix="/api/v1", tags=["Skin Screening"])

REDIS_HOST = os.getenv("REDIS_HOST", "127.0.0.1")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD")
QUEUE_NAME = "mediguide:analysis_queue"

redis_client = redis.Redis(
    host=REDIS_HOST,
    port=REDIS_PORT,
    password=REDIS_PASSWORD,
    decode_responses=True,
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# 약물명 표기 변형·오타 보정 및 성분명 표준화 매핑 레이어

STANDARD_MEDICATION_ALIASES = {
    "더모베이트연고0.05%": ["더모베이트", "더모베이트연고", "더모베이트크림", "클로베타솔", "클로베타솔프로피오네이트"],
    "리도멕스크림0.15%": ["리도멕스", "리도멕스크림", "리도멕스연고", "프레드니솔론", "프레드니솔론발레로아세테이트"],
    "에바스텔정10mg": ["에바스텔", "에바스텔정", "에바스틴"],
    "비판텐연고": ["비판텐", "비판텐연고", "덱스판테놀"],
    "에스로반연고": ["에스로반", "에스로반연고", "무피로신"],
    "타이레놀정500mg": ["타이레놀", "타이레놀정", "아세트아미노펜"],
    "락티케어로션1%": ["락티케어", "락티케어로션", "하이드로코르티손"],
    "데소나로션0.05%": ["데소나", "데소나로션", "데소나이드"],
}


def normalize_medication_names(raw_meds: list[str]) -> list[str]:
    """띄어쓰기, 함량 누락, 성분명, 오타 등을 표준 약품명으로 정규화"""
    normalized = []
    # 검색용 역인덱스 생성
    alias_to_standard = {}
    for std_name, aliases in STANDARD_MEDICATION_ALIASES.items():
        alias_to_standard[re.sub(r"\s+", "", std_name).lower()] = std_name
        for alias in aliases:
            alias_to_standard[re.sub(r"\s+", "", alias).lower()] = std_name

    all_keys = list(alias_to_standard.keys())

    for med in raw_meds:
        cleaned = re.sub(r"\s+", "", med).strip()
        if not cleaned:
            continue
        key = cleaned.lower()

        # 1) 정확히 일치하는 별칭/성분명이 있는 경우
        if key in alias_to_standard:
            std = alias_to_standard[key]
        else:
            # 2) 유사도 매칭(오타 보정, 0.72 이상 일치 시 표준 약품명으로 자동 교정)
            matches = difflib.get_close_matches(key, all_keys, n=1, cutoff=0.72)
            std = alias_to_standard[matches[0]] if matches else med.strip()

        if std not in normalized:
            normalized.append(std)

    return normalized
#
def ensure_demo_user(db: Session) -> models.User:
    """시연용 기본 사용자(user_id=1)가 DB에 없으면 자동 생성"""
    user = db.query(models.User).filter(models.User.user_id == 1).first()
    if not user:
        user = models.User(
            user_id=1,
            email="demo@mediguide.ai",
            password_hash="demo_hash",
            name="시연 사용자",
            is_pregnant_or_nursing=False,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


@router.post("/predict")
async def create_prediction_task(
    file: UploadFile = File(...),
    body_part: str = Form(default="FACE"),
    symptoms: str = Form(default="[]"),
    current_meds: str = Form(default="[]"),
    db: Session = Depends(get_db),
):
    task_id = str(uuid.uuid4())
    raw_bytes = await file.read()

    # 이미지 손상 예외 처리 + 약물명 표준 정규화 적용
    os.makedirs("uploads", exist_ok=True)
    image_path = f"uploads/{task_id}.jpg"
    try:
        clean_img = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
        clean_img.save(image_path, format="JPEG")
    except Exception:
        raise HTTPException(status_code=400, detail="유효하지 않거나 손상된 이미지 파일입니다. JPG/PNG 이미지를 업로드해 주세요.")

    # 문자열로 넘어온 JSON 리스트 파싱 (예: '["가려움"]' 또는 '가려움, 붉어짐')
    try:
        symptoms_list = json.loads(symptoms) if symptoms.startswith("[") else [s.strip() for s in symptoms.split(",") if s.strip()]
    except Exception:
        symptoms_list = [symptoms] if symptoms else []

    try:
        raw_meds_list = json.loads(current_meds) if current_meds.startswith("[") else [m.strip() for m in current_meds.split(",") if m.strip()]
    except Exception:
        raw_meds_list = [current_meds] if current_meds else []

    # 띄어쓰기·성분명·오타를 표준 약품명으로 정제하여 DUR/RAG 매칭 정확도 보장
    meds_list = normalize_medication_names(raw_meds_list)

    # 2. MySQL에 SkinRecord -> LesionImage -> AnalysisTask 순서대로 적재
    user = ensure_demo_user(db)

    record = models.SkinRecord(
        user_id=user.user_id,
        body_part=body_part,
        symptoms_morphology=symptoms_list,
        current_medications=meds_list,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    lesion_img = models.LesionImage(
        record_id=record.record_id,
        original_image_url=image_path,
    )
    db.add(lesion_img)

    task = models.AnalysisTask(
        task_id=task_id,
        record_id=record.record_id,
        status="PENDING",
        progress_percent=10,
    )
    db.add(task)
    db.commit()

    # 3. AI Worker가 기다리는 Redis 큐에 작업 전송
    task_payload = {
        "task_id": task_id,
        "record_id": record.record_id,
        "user_id": user.user_id,
        "body_part": body_part,
        "symptoms": symptoms_list,
        "current_medications": meds_list,
        "image_path": image_path,
    }
    await redis_client.lpush(QUEUE_NAME, json.dumps(task_payload, ensure_ascii=False))

    return {"task_id": task_id, "record_id": record.record_id, "status": "PENDING"}


@router.get("/status/{task_id}")
async def check_prediction_status(task_id: str, db: Session = Depends(get_db)):
    # 1. Redis 실시간 진행률/상태 조회 (worker.py의 sync_task_status와 동기화)
    redis_state = await redis_client.hgetall(f"task:{task_id}")
    task = db.query(models.AnalysisTask).filter(models.AnalysisTask.task_id == task_id).first()

    if not task and not redis_state:
        raise HTTPException(status_code=404, detail="해당 분석 작업을 찾을 수 없습니다.")

    status = redis_state.get("status") if redis_state else task.status
    progress = int(redis_state.get("progress", task.progress_percent if task else 0))
    message = redis_state.get("message", "AI 분석 대기 중입니다...")

    response = {
        "task_id": task_id,
        "status": status,
        "progress": progress,
        "message": message,
    }

    # 2. 분석 완료(COMPLETED) 시 MySQL에서 진단 결과 및 약물·FTU 가이드 함께 반환
    if status == "COMPLETED" and task:
        screening = task.screening_result
        guide = task.health_guide
        lesion_img = task.record.images[0] if task.record and task.record.images else None

        if screening:
            response["screening_result"] = {
                "primary_disease_code": screening.primary_disease_code,
                "primary_disease_name": screening.primary_disease_name,
                "confidence_score": screening.confidence_score,
                "top3_candidates": screening.top3_candidates,
                "risk_level": screening.risk_level,
                "visual_finding_summary": screening.visual_finding_summary,
                "gradcam_image_url": lesion_img.gradcam_image_url if lesion_img else None,
            }
        if guide:
            response["health_guide"] = {
                "dur_warnings": guide.dur_warnings,
                "medication_guide": guide.medication_guide,
                "ftu_dosage_guide": guide.ftu_dosage_guide,
                "lifestyle_guide": guide.lifestyle_guide,
                "doctor_questions": guide.doctor_questions,
                "retrieved_sources": guide.retrieved_sources,
            }
        response["disclaimer"] = "본 결과는 의학적 진단을 대신할 수 없는 참고용 스크리닝 안내입니다."

    return response
