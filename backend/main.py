import json
import os
import uuid
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import redis

# 프로젝트 루트의 .env 로드 (비밀키 하드코딩 금지)[cite: 3]
load_dotenv()

app = FastAPI(
    title="MediGuide AI API",
    version="0.1.0",
)

# CORS 허용 오리진 제한 (와일드카드 "*" 금지, 지정된 프론트엔드 도메인만 허용)[cite: 3]
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

# Redis 클라이언트 연결 (worker.py와 동일한 비밀번호 인증 및 큐 이름 통일)[cite: 4]
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


# 내부 서버 에러 스택 트레이스 외부 노출 차단[cite: 3]
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. Please try again later."},
    )


# 요청 스키마 정의
class AnalysisCreateRequest(BaseModel):
    user_id: int
    body_part: str
    symptoms: str
    image_path: str


# 1. 헬스 체크 API[cite: 3]
@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "backend"}


# 2. 비동기 AI 분석 작업 접수 API (202 Accepted)
@app.post("/api/v1/analyses", status_code=202)
def create_analysis_task(req: AnalysisCreateRequest):
    task_id = str(uuid.uuid4())
    task_payload = {
        "task_id": task_id,
        "user_id": req.user_id,
        "body_part": req.body_part,
        "symptoms": req.symptoms,
        "image_path": req.image_path,
    }

    # 초기 상태 저장 (PENDING)
    redis_client.hset(
        f"task:{task_id}",
        mapping={
            "status": "PENDING",
            "progress": "10",
            "message": "분석 대기열에 등록되었습니다.",
            "result": "",
        },
    )

    # Redis 작업 큐에 Push (worker.py와 동일한 QUEUE_NAME 사용)[cite: 4]
    redis_client.lpush(QUEUE_NAME, json.dumps(task_payload))

    return {
        "task_id": task_id,
        "status": "PENDING",
        "message": "AI 분석 작업이 접수되었습니다.",
    }


# 3. 비동기 작업 상태 및 결과 조회 API
@app.get("/api/v1/tasks/{task_id}")
def get_task_status(task_id: str):
    task_data = redis_client.hgetall(f"task:{task_id}")
    if not task_data:
        raise HTTPException(
            status_code=404, detail="존재하지 않는 작업 ID입니다."
        )

    return {
        "task_id": task_id,
        "status": task_data["status"],
        "progress": int(task_data["progress"]),
        "message": task_data["message"],
        "result": (
            json.loads(task_data["result"]) if task_data["result"] else None
        ),
    }