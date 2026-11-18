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

    # 1. 위치정보(EXIF) 제거 후 uploads 폴더에 깨끗한 이미지 저장
    os.makedirs("uploads", exist_ok=True)
    image_path = f"uploads/{task_id}.jpg"
    clean_img = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
    clean_img.save(image_path, format="JPEG")

    # 문자열로 넘어온 JSON 리스트 파싱 (예: '["가려움"]' 또는 '가려움, 붉어짐')
    try:
        symptoms_list = json.loads(symptoms) if symptoms.startswith("[") else [s.strip() for s in symptoms.split(",") if s.strip()]
    except Exception:
        symptoms_list = [symptoms] if symptoms else []

    try:
        meds_list = json.loads(current_meds) if current_meds.startswith("[") else [m.strip() for m in current_meds.split(",") if m.strip()]
    except Exception:
        meds_list = [current_meds] if current_meds else []

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