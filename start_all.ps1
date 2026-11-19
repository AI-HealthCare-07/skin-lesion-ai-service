Write-Host "🩺 MediGuide AI 로컬 개발 서버를 한 번에 시작합니다..." -ForegroundColor Cyan

docker compose up -d
Start-Sleep -Seconds 3

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; .\.venv\Scripts\Activate.ps1; uvicorn backend.main:app --reload"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; .\.venv\Scripts\Activate.ps1; python -m ai_worker.worker"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD\frontend'; npm run dev"

Write-Host "✅ 모든 로컬 서버가 실행되었습니다! http://localhost:5173 으로 접속하세요." -ForegroundColor Green