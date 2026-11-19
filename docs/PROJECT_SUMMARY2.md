## 📅 개발 진행 및 트러블슈팅 일지 (2026-11-19)

### ✨ 신규 기능 추가 및 고도화
1. **실시간 복약 푸시 알림 & 한국어 TTS 음성 안내 (`frontend/src/alertHelper.js`)**
   * 브라우저 `Notification API`와 `Web Speech API(SpeechSynthesis)`를 연동해 복약 시간에 상단 실시간 배너, 데스크톱 푸시, 한국어 음성 안내 동시 제공
   * 시연 및 어르신 접근성을 위한 `[🔔 알림·음성 테스트]` 버튼 및 보호자 큰 글씨 페이지 음성 읽기 기능 추가
2. **리포트 연동형 AI 복약·생활 Q&A 챗봇 (`backend/main.py`, `frontend/src/ReportChatBox.jsx`)**
   * `POST /api/v1/chat` 엔드포인트를 신설하여 현재 리포트의 예측 질환명, 병변 부위, 보유 의약품, DUR 경고 문맥을 반영한 맞춤형 질의응답 및 추천 질문 버튼 구현
3. **ResNet50 피부 병변 분류 모델 학습 파이프라인 (`scripts/train_derm_model.py`)**
   * 실제 피부과 데이터셋(`ImageFolder`) 및 합성 데모 데이터(`--demo`)로 ResNet50 가중치를 학습·저장할 수 있는 CLI 파이프라인 구축
4. **응급 피부 증상(레드플래그) 조기 트리아제 경보 (`frontend/src/EmergencyTriageBanner.jsx`)**
   * 고열, 광범위 수포·표피박리, 점막 침범, 호흡곤란·혈관부종, 2차 감염 키워드 및 극심한 통증(8점 이상) 감지 시 최상단 적색 응급 경보 배너 및 주변 응급실 탐색 연결
5. **개인 약물 알레르기·기저질환 맞춤형 DUR 교차 검증 (`frontend/src/PersonalDurBanner.jsx`)**
   * 스테로이드·항생제·항히스타민 알레르기 이력과 임신·수유부, 소아·고령자, 당뇨·면역저하, 녹내장·백내장 기저질환을 보유 의약품 및 부위와 교차 검증하는 맞춤 경고 확장
6. **풀스택 Docker Compose 컨테이너 패키징 & 로컬 원클릭 실행기**
   * `Dockerfile.backend`, `frontend/Dockerfile`, `docker-compose.fullstack.yml`, `.dockerignore`로 6개 컨테이너 통합 빌드 검증 및 `start_all.ps1` 로컬 일괄 실행기 구축
7. **메인 랜딩 대시보드 UI 개선 (`frontend/src/MainWelcomePanel.jsx`)**
   * 초기 대기 화면을 3단계 XAI·DUR·FTU 핵심 파이프라인 안내 카드 및 정확한 병변 촬영 가이드 패널로 고도화

---

### 🔧 주요 트러블슈팅 및 해결 과정

| 발생 문제 | 원인 분석 | 해결 조치 |
| :--- | :--- | :--- |
| **`App.jsx` 구문 오류 (`Unterminated string`)** | 단일 파일 코드 길이가 길어지면서 붙여넣기 중 문자열 따옴표가 누락되어 Vite 빌드 에러 발생 | `git checkout` 복구 후 알림, 챗봇, 응급 경보, 맞춤 DUR을 독립 모듈(`*.jsx`, `*.js`)로 분리하여 구조 개선 |
| **테스트용 더미 가중치(`derm_resnet50.pth`) 잔존** | `vision_model.py`가 `.pth` 파일 존재 시 우선 로드하도록 설계되어 `--demo` 더미 파일이 멀티모달 추론을 덮어쓸 위험 발생 | 학습 파이프라인 동작 검증 직후 테스트 `.pth` 파일을 삭제하여 기존 멀티모달 예측 성능 유지 |
| **Docker 빌드 컨텍스트 초과 (`1.50GB`) 및 `mysql.sock` 충돌** | 루트에 `.dockerignore`가 없어 로컬 `mysql_data/mysql.sock`, `.venv`, `node_modules`까지 전송되며 `invalid file request` 실패 | 불필요한 로컬 DB 및 가상환경 폴더를 제외하는 `.dockerignore`를 생성하여 전송 용량을 `511KB`로 경량화 |
| **`Dockerfile.backend` 내 `requirements.txt` 경로 불일치** | 루트가 아닌 `backend/requirements.txt`에 위치한 파일을 `COPY requirements.txt .`로 참조하여 빌드 중단 | `COPY backend/requirements.txt ./requirements.txt`로 경로 수정 및 `ai_worker`용 `torch` 설치 통합으로 6개 컨테이너 정상 빌드 달성 |