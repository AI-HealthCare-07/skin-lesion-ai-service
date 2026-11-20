# 실행 위치를 항상 프로젝트 루트(AI-based-web-service-project)로 고정
Set-Location $PSScriptRoot

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "🩺 MediGuide AI 통합 개발 환경 자동 실행기" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Docker 인프라(MySQL, Redis, Qdrant) 실행
Write-Host "`n[1/4] Docker 인프라(MySQL, Redis, Qdrant) 시작 중..." -ForegroundColor Yellow
docker compose -f docker-compose.fullstack.yml up -d mysql redis qdrant

# 2. MySQL이 완전히 부팅(healthy)될 때까지 대기 (WinError 10061 방지)
Write-Host "[2/4] MySQL 부팅 완료 대기 중..." -ForegroundColor Yellow
$maxRetry = 30
for ($i = 1; $i -le $maxRetry; $i++) {
    $health = docker inspect --format="{{.State.Health.Status}}" mediguide_mysql_full 2>$null
    if ($health -eq "healthy") {
        Write-Host "✅ MySQL 준비 완료!" -ForegroundColor Green
        break
    }
    Start-Sleep -Seconds 2
    Write-Host "   대기 중... ($i/$maxRetry)" -ForegroundColor DarkGray
}

# 3. Qdrant 'mediguide_knowledge' 컬렉션 존재 여부 확인 후 없으면 자동 적재
Write-Host "[3/4] Qdrant RAG 지식 컬렉션 상태 점검 중..." -ForegroundColor Yellow
try {
    $null = Invoke-RestMethod -Uri "http://127.0.0.1:6333/collections/mediguide_knowledge" -Method Get -ErrorAction Stop
    Write-Host "✅ Qdrant 지식 컬렉션(mediguide_knowledge) 확인 완료!" -ForegroundColor Green
} catch {
    Write-Host "⚠️ 컬렉션이 없어 초기 RAG 데이터를 자동 적재합니다..." -ForegroundColor Magenta
    uv run python .\scripts\ingest_rag_data.py
}

# 4. 백엔드, AI 워커, 프론트엔드를 각각 새 터미널 창에서 정확한 경로로 실행
Write-Host "[4/4] 백엔드 · AI 워커 · 프론트엔드 서버 실행 중..." -ForegroundColor Yellow

Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$PSScriptRoot'; Write-Host '🚀 FastAPI 백엔드 서버 (Port 8000)' -ForegroundColor Cyan; uv run uvicorn backend.main:app --reload --port 8000"

Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$PSScriptRoot'; Write-Host '🤖 AI 비동기 워커 (ResNet50 + RAG)' -ForegroundColor Green; uv run python -m ai_worker.worker"

Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$PSScriptRoot\frontend'; Write-Host '🌐 React 프론트엔드 (Port 5173)' -ForegroundColor Magenta; npm run dev"

Write-Host "`n✨ 모든 서비스가 실행되었습니다! 브라우저에서 http://localhost:5173 으로 접속하세요." -ForegroundColor Cyan