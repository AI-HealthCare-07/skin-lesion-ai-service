## 📅 개발 진행 및 트러블슈팅 일지 (2026-11-19)

### 1. 신규 기능 추가 및 고도화
- **실시간 복약 푸시 알림 & 한국어 TTS 음성 안내 (`frontend/src/alertHelper.js`)**
  - 브라우저 `Notification API`와 `Web Speech API(SpeechSynthesis)`를 연동해 설정된 복약·도포 시간에 상단 실시간 배너, 데스크톱 푸시, 한국어 음성 안내를 동시 제공
  - 시연 및 어르신 접근성을 위한 `[🔔 알림·음성 테스트]` 및 보호자 공유 페이지 음성 읽기 기능 추가
- **리포트 연동형 AI 복약·생활 Q&A 챗봇 (`backend/main.py`, `frontend/src/ReportChatBox.jsx`)**
  - `POST /api/v1/chat` 엔드포인트를 신설하여 현재 리포트의 예측 질환명, 병변 부위, 보유 의약품, DUR 경고 문맥을 반영한 맞춤형 질의응답 및 빠른 질문 추천 버튼 구현
- **ResNet50 피부 병변 분류 모델 학습 파이프라인 (`scripts/train_derm_model.py`)**
  - 향후 실제 피부과 데이터셋(`ImageFolder`) 및 합성 데모 데이터(`--demo`)로 ResNet50 가중치를 학습·저장할 수 있는 CLI 파이프라인 구축
- **응급 피부 증상(레드플래그) 조기 트리아제 경보 (`frontend/src/EmergencyTriageBanner.jsx`)**
  - 전신 발열, 광범위 수포·표피박리, 점막 침범, 호흡곤란·혈관부종, 2차 감염 키워드 및 극심한 통증(8점 이상) 감지 시 최상단 적색 응급 경보 배너 및 주변 응급실 탐색 연결
- **개인 약물 알레르기·기저질환 맞춤형 DUR 교차 검증 (`frontend/src/PersonalDurBanner.jsx`)**
  - 스테로이드·항생제·항히스타민 알레르기 이력과 임신·수유부, 소아·고령자, 당뇨·면역저하, 녹내장·백내장 기저질환을 보유 의약품 및 발생 부위와 교차 검증하는 맞춤 경고 시스템 확장
- **풀스택 Docker Compose 컨테이너 패키징 & 로컬 원클릭 실행기**
  - `Dockerfile.backend`, `frontend/Dockerfile`, `docker-compose.fullstack.yml`, `.dockerignore`를 구성해 MySQL·Redis·Qdrant·FastAPI·AI Worker·React 6개 컨테이너 통합 빌드 검증 완료
  - 로컬 개발 편의성을 위한 원클릭 통합 실행 스크립트(`start_all.ps1`) 구축
- **메인 랜딩 대시보드 UI 개선 (`frontend/src/MainWelcomePanel.jsx`)**
  - 초기 대기 화면을 3단계 XAI·DUR·FTU 핵심 파이프라인 안내 카드 및 촬영 가이드 패널로 고도화

### 2. 발생 오류 및 트러블슈팅 해결 기록
1. **`App.jsx` 대용량 코드 덮어쓰기 중 구문 오류 (`Unterminated string`)**
   - *원인:* 단일 파일 코드 길이가 길어지면서 붙여넣기 과정 중 문자열 따옴표가 누락되어 Vite 빌드 에러 발생
   - *해결:* `git checkout`으로 정상 커밋 복구 후, 알림(`alertHelper.js`), 챗봇(`ReportChatBox.jsx`), 응급 경보(`EmergencyTriageBanner.jsx`), 맞춤 DUR(`PersonalDurBanner.jsx`)을 독립 모듈로 분리하여 유지보수성과 안정성 확보
2. **학습 파이프라인 테스트용 더미 가중치(`derm_resnet50.pth`) 잔존 이슈**
   - *원인:* `vision_model.py`가 가중치 파일 존재 시 우선 로드하도록 설계되어 있어, `--demo` 테스트로 생성된 더미 파일이 남을 경우 멀티모달 임상 보정 추론을 덮어쓸 위험 확인
   - *해결:* 파이프라인 동작 검증 직후 테스트 `.pth` 파일을 제거하여 기존 멀티모달 예측 성능 유지
3. **Docker Compose 컨텍스트 전송 용량 초과 (`1.50GB`) 및 소켓 파일(`mysql.sock`) 충돌**
   - *원인:* 루트 경로에 `.dockerignore`가 없어 로컬 `mysql_data/mysql.sock`, `.venv`, `node_modules`까지 빌드 컨텍스트에 포함되면서 `invalid file request` 빌드 실패 발생
   - *해결:* 불필요한 로컬 데이터 및 가상환경 폴더를 제외하는 `.dockerignore`를 생성하여 전송 용량을 `511KB` 수준으로 경량화
4. **`Dockerfile.backend` 내 `requirements.txt` 경로 불일치 오류**
   - *원인:* 루트가 아닌 `backend/requirements.txt` 경로에 위치한 의존성 파일을 `COPY requirements.txt .`로 참조하여 빌드 실패
   - *해결:* `COPY backend/requirements.txt ./requirements.txt`로 경로를 수정하고 `ai_worker`용 `torch`, `torchvision` 설치를 통합하여 6개 컨테이너 정상 빌드 달성