import json
import os
import time
from dotenv import load_dotenv
import redis

load_dotenv()

REDIS_HOST = os.getenv("REDIS_HOST", "127.0.0.1")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD")

if not REDIS_PASSWORD:
    raise RuntimeError("REDIS_PASSWORD is missing in .env")

# 비밀번호 인증을 거친 Redis 클라이언트 연결
redis_client = redis.Redis(
    host=REDIS_HOST,
    port=REDIS_PORT,
    password=REDIS_PASSWORD,
    decode_responses=True,
)

QUEUE_NAME = "mediguide:analysis_queue"


def update_status(
    task_id: str, status: str, progress: int, message: str, result: dict = None
):
    mapping = {
        "status": status,
        "progress": str(progress),
        "message": message,
    }
    if result:
        mapping["result"] = json.dumps(result, ensure_ascii=False)
    redis_client.hset(f"task:{task_id}", mapping=mapping)


def run_worker():
    redis_client.ping()
    print("🚀 [AI Worker] Connected to Redis securely. Waiting for tasks...")

    while True:
        # Windows 터미널에서 Ctrl+C 종료가 잘 먹히도록 timeout=5 유지
        task_item = redis_client.blpop(QUEUE_NAME, timeout=5)
        if not task_item:
            continue

        _, raw_data = task_item
        task = json.loads(raw_data)
        task_id = task["task_id"]
        print(f"📥 작업 수신: {task_id} (부위: {task['body_part']})")

        # Step 1: 이미지 스크리닝 단계 (더미 시뮬레이션)
        update_status(
            task_id,
            "SCREENING",
            40,
            "피부 병변 AI 스크리닝 및 Grad-CAM 추출 중...",
        )
        time.sleep(2)

        # Step 2: RAG 가이드 생성 단계 (더미 시뮬레이션)
        update_status(
            task_id,
            "RAG_GENERATING",
            75,
            "식약처 의약품(e약은요) 및 DUR 금기사항 대조 중...",
        )
        time.sleep(2)

        # Step 3: 완료 처리
        mock_result = {
            "top_disease": "아토피 피부염 의심 (신뢰도 87.4%)",
            "guide": (
                f"[{task['body_part']}] 부위는 피부가 얇으므로 약한 등급"
                " 외용제를 1일 2회 얇게 도포하세요."
            ),
            "source": "식약처 의약품개요정보(e약은요)",
        }
        update_status(
            task_id,
            "COMPLETED",
            100,
            "분석 및 가이드 생성이 완료되었습니다.",
            mock_result,
        )
        print(f"✅ 작업 완료: {task_id}")


if __name__ == "__main__":
    run_worker()