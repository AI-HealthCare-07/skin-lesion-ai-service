from datetime import datetime
import json
import os
import sys
import time
from dotenv import load_dotenv
from qdrant_client import QdrantClient
import redis
from sentence_transformers import SentenceTransformer

# 반드시 ai_worker, backend 임포트보다 맨 위에 위치해야 함!
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ai_worker.vision_model import SkinLesionGradCAM
from backend import models
from backend.database import SessionLocal

load_dotenv()

# 1. Redis 보안 연결
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
    socket_timeout=30,
    socket_connect_timeout=5,
    health_check_interval=30,
)
QUEUE_NAME = "mediguide:analysis_queue"

# 2. Qdrant 벡터 DB 연결 & 임베딩 모델 사전 로드
QDRANT_HOST = os.getenv("QDRANT_HOST", "127.0.0.1")
QDRANT_PORT = int(os.getenv("QDRANT_PORT", 6333))
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY")
COLLECTION_NAME = "mediguide_knowledge"

# [수정] QDRANT_API_KEY가 설정된 경우에만 api_key를 전달해 불필요한 insecure connection 경고 방지
qdrant_url = f"http://{QDRANT_HOST}:{QDRANT_PORT}"
if QDRANT_API_KEY:
    qdrant_client = QdrantClient(
        url=qdrant_url,
        api_key=QDRANT_API_KEY,
    )
else:
    qdrant_client = QdrantClient(
        url=qdrant_url,
    )

print("⏳ [AI Worker] 임베딩 모델(BAAI/bge-m3) 로딩 중...")
embedder = SentenceTransformer("BAAI/bge-m3")
print("⏳ [AI Worker] 피부 병변 PyTorch & Grad-CAM 모델 로딩 중...")
vision_analyzer = SkinLesionGradCAM()

# 3. 부위별 표준 FTU(Finger Tip Unit) 매핑 테이블 (1 FTU = 0.5g)
FTU_MAP = {
    "FACE": ("얼굴 및 목 전체", 2.5),
    "NECK": ("목 부위", 1.0),
    "ARM": ("한쪽 팔 전체", 3.0),
    "HANDS_FEET": ("한쪽 손 또는 발", 1.0),
    "TRUNK": ("몸통 앞면 또는 뒷면", 7.0),
    "LEG": ("한쪽 다리 전체", 6.0),
}


def sync_task_status(db, task_id: str, status: str, progress: int, message: str):
    """Redis 실시간 캐시와 MySQL 작업 상태를 동시에 동기화"""
    redis_client.hset(
        f"task:{task_id}",
        mapping={
            "status": status,
            "progress": str(progress),
            "message": message,
        },
    )
    task = db.query(models.AnalysisTask).filter(models.AnalysisTask.task_id == task_id).first()
    if task:
        task.status = status
        task.progress_percent = progress
        if status == "COMPLETED":
            task.completed_at = datetime.utcnow()
        db.commit()


def run_rag_and_dur_pipeline(body_part: str, symptoms: list, meds: list, user: models.User):
    """Qdrant 벡터 검색 + DUR 부위/프로필 안전 필터링 파이프라인"""
    meds_str = ", ".join(meds) if meds else "처방약 미입력"
    symptoms_str = ", ".join(symptoms) if symptoms else "일반 피부 발진"

    # (1) 검색 질의 구성 및 벡터 임베딩
    query_text = f"부위: {body_part}, 증상: {symptoms_str}, 처방의약품: {meds_str} 복약 주의사항 및 FTU 도포법"
    query_vector = embedder.encode(query_text).tolist()

    # (2) Qdrant 상위 3개 근거 문서 검색
    hits = qdrant_client.query_points(
        collection_name=COLLECTION_NAME,
        query=query_vector,
        limit=3,
    ).points

    dur_warnings = []
    medication_guide = []
    retrieved_sources = []

    for hit in hits:
        payload = hit.payload
        doc_id = payload.get("doc_id", "UNKNOWN")
        drug_name = payload.get("drug_name", "")
        potency = payload.get("steroid_potency_class", 0)
        safe_for_face = payload.get("safe_for_face", True)

        # 인용 근거 출처 기록 (환각 방지용 Citation)
        retrieved_sources.append({
            "doc_id": doc_id,
            "organization": payload.get("organization", "식약처/학회 지침"),
            "title": drug_name,
            "similarity_score": round(hit.score, 4),
        })

        # 처방약과 매칭되거나 관련성이 높은 약품에 대해 DUR & 가이드 조립
        is_prescribed = any(m in drug_name or drug_name in m for m in meds)
        if is_prescribed or hit.score >= 0.45:
            # Rule-Based DUR 1: 안면부 고강도 스테로이드 금기 검증
            if body_part == "FACE" and (not safe_for_face or (1 <= potency <= 3)):
                dur_warnings.append({
                    "severity": "HIGH",
                    "warning_type": "BODY_PART_CONTRAINDICATION",
                    "drug_name": drug_name,
                    "message": (
                        f"'{drug_name}'(스테로이드 {potency}등급)는 안면부(얼굴) 사용 시 피부 위축 및 "
                        "모세혈관 확장 위험이 매우 높으므로 전문의 확인 전 도포를 중단하세요."
                    ),
                    "source_id": doc_id,
                })

            # Rule-Based DUR 2: 사용자 임신/수유 여부 경고
            if user and user.is_pregnant_or_nursing and potency > 0:
                dur_warnings.append({
                    "severity": "MODERATE",
                    "warning_type": "PREGNANCY_CAUTION",
                    "drug_name": drug_name,
                    "message": f"임신/수유 중에는 외용 스테로이드제('{drug_name}')의 광범위·장기 사용 전 반드시 전문의와 상담하세요.",
                    "source_id": doc_id,
                })

            if payload.get("category") != "대한피부과학회 진료지침":
                medication_guide.append({
                    "drug_name": drug_name,
                    "ingredient": payload.get("ingredient", "-"),
                    "guidance_summary": payload.get("text", ""),
                    "source_id": doc_id,
                })

    # (3) 부위별 FTU 정량 도포 가이드 계산
    part_label, ftu_amount = FTU_MAP.get(body_part, ("해당 환부", 2.0))
    ftu_dosage_guide = {
        "body_part": body_part,
        "body_part_label": part_label,
        "recommended_ftu": ftu_amount,
        "recommended_grams": round(ftu_amount * 0.5, 2),
        "instruction": (
            f"검지 손가락 끝마디 한 줄(1 FTU = 약 0.5g) 기준으로 {part_label}에는 "
            f"약 {ftu_amount} FTU({round(ftu_amount * 0.5, 2)}g)를 보습제 도포 15분 후 얇게 펴 바릅니다."
        ),
    }

    return dur_warnings, medication_guide, ftu_dosage_guide, retrieved_sources


def run_worker():
    redis_client.ping()
    print("🚀 [AI Worker] Redis, MySQL, Qdrant RAG 엔진 준비 완료! 작업 대기 중...")

    while True:
        try:
            task_item = redis_client.blpop(QUEUE_NAME, timeout=5)
        except redis.exceptions.TimeoutError:
            continue

        if not task_item:
            continue

        _, raw_data = task_item
        task_data = json.loads(raw_data)
        task_id = task_data["task_id"]
        record_id = task_data["record_id"]
        user_id = task_data.get("user_id", 1)
        body_part = task_data["body_part"]
        symptoms = task_data.get("symptoms", [])
        meds = task_data.get("current_medications", [])

        print(f"📥 작업 수신: {task_id} (Record #{record_id}, 부위: {body_part}, 약물: {meds})")
        db = SessionLocal()
        image_path = None

        try:
            user = db.query(models.User).filter(models.User.user_id == user_id).first()

            image_path = task_data.get("image_path", "uploads/sample_lesion.jpg")

            # 1단계: 실제 PyTorch 피부 병변 스크리닝 및 Grad-CAM 히트맵 생성
            sync_task_status(db, task_id, "SCREENING", 40, "PyTorch AI 피부 병변 분석 및 Grad-CAM 히트맵 생성 중...")
            vision_result = vision_analyzer.predict_and_explain(
                image_path=image_path,
                body_part=body_part,
                symptoms=symptoms,
            )

            # [추가] 저신뢰도(15% 미만) 오인식 차단 방어 로직
            raw_conf = float(vision_result.get("confidence_score", 0))
            norm_conf = raw_conf / 100.0 if raw_conf > 1.0 else raw_conf
            if norm_conf < 0.15:
                sync_task_status(
                    db,
                    task_id,
                    "LOW_CONFIDENCE",
                    100,
                    "피부 병변을 명확히 인식할 수 없습니다. 초점을 맞춰 다시 촬영하거나 전문의와 상담하세요.",
                )
                print(f"⚠️ [저신뢰도 차단] Task {task_id} (신뢰도: {raw_conf})")
                continue

            lesion_img = db.query(models.LesionImage).filter(models.LesionImage.record_id == record_id).first()
            if lesion_img:
                lesion_img.gradcam_image_url = vision_result["gradcam_path"]
                db.commit()

            # 2단계: 실제 Qdrant RAG 검색 및 DUR 안전 필터링 실행
            sync_task_status(db, task_id, "RAG_GENERATING", 75, "Qdrant 벡터 DB 의약품·FTU 지침 검색 및 DUR 대조 중...")
            dur_warnings, medication_guide, ftu_dosage_guide, retrieved_sources = run_rag_and_dur_pipeline(
                body_part=body_part,
                symptoms=symptoms,
                meds=meds,
                user=user,
            )

            # 3단계: MySQL SCREENING_RESULTS 저장 (실제 모델 추론 결과 반영)
            final_risk = "HIGH_URGENT" if dur_warnings else vision_result["risk_level"]
            screening = models.ScreeningResult(
                task_id=task_id,
                primary_disease_code=vision_result["primary_disease_code"],
                primary_disease_name=vision_result["primary_disease_name"],
                confidence_score=vision_result["confidence_score"],
                top3_candidates=vision_result["top3_candidates"],
                risk_level=final_risk,
                visual_finding_summary=vision_result["visual_finding_summary"],
            )
            db.add(screening)

            # 4단계: MySQL HEALTH_GUIDES 저장 (실제 RAG 검색 근거 반영)
            guide = models.HealthGuide(
                task_id=task_id,
                dur_warnings=dur_warnings,
                medication_guide=medication_guide,
                ftu_dosage_guide=ftu_dosage_guide,
                lifestyle_guide=[
                    "미온수(32~34°C)로 자극이 적은 약산성 세정제를 사용해 짧게 세안하세요.",
                    "세안 후 3분 이내에 무향료·저자극 보습제를 충분히 도포하세요.",
                ],
                doctor_questions=[
                    "현재 처방받은 외용제가 해당 부위에 사용하기에 강도가 적절할까요?",
                    "증상 호전 후 연고를 중단하고 보습제만 유지하는 시점은 언제가 좋을까요?",
                    "항히스타민제 복용 후 졸음이 나타날 경우 복용 시간대를 조절해도 될까요?",
                ],
                retrieved_sources=retrieved_sources,
            )
            db.add(guide)
            db.commit()

            # 5단계: 완료 동기화
            sync_task_status(db, task_id, "COMPLETED", 100, "RAG 기반 분석 및 가이드 생성이 완료되었습니다.")
            print(f"✅ [RAG + DB 저장 완료] Task {task_id} (검색 근거 {len(retrieved_sources)}건, DUR 경고 {len(dur_warnings)}건)")

        except Exception as e:
            db.rollback()
            sync_task_status(db, task_id, "FAILED", 0, f"처리 중 오류 발생: {str(e)}")
            print(f"❌ 작업 실패: {task_id} - {e}")
        finally:
            db.close()
            # [추가] 추론 완료 후 원본 업로드 이미지 즉시 파기 (샘플 이미지 제외)
            if image_path and "sample_lesion" not in image_path and os.path.exists(image_path):
                try:
                    os.remove(image_path)
                except OSError:
                    pass


if __name__ == "__main__":
    run_worker()