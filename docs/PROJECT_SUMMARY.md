# 1. docs/PROJECT_SUMMARY.md 파일에 개발 정리 및 트러블슈팅 로그 저장
@'
# 🩺 MediGuide AI - 개발 진행 및 통합 검증 리포트

**설명 가능한(XAI) 피부 병변 스크리닝 & 식약처 DUR 기반 맞춤형 복약 가이드 웹 서비스**

피부 병변 이미지와 문진 데이터를 기반으로 AI가 병소 활성도(Grad-CAM)를 시각화하고, 식약처 e약은요 및 심평원 DUR 데이터를 RAG(검색 증강 생성)로 결합하여 안전한 연고 도포량(FTU)과 복약 주의사항을 제공하는 풀스택 헬스케어 웹 애플리케이션입니다.

---

## 🛠️ 시스템 아키텍처 및 기술 스택

* **Frontend:** React (Vite), Custom CSS (`http://localhost:5173`)
* **Backend:** FastAPI, Uvicorn, SQLAlchemy ORM, Pydantic (`http://127.0.0.1:8000`)
* **AI & XAI Worker:** PyTorch (`ResNet50`), Grad-CAM 히트맵 오버레이 파이프라인
* **Database & Queue:** MySQL (`mediguide_db`), Redis (비동기 작업 큐), Qdrant (벡터 DB / RAG)

---

## ✨ 주요 구현 기능

1. **비동기 AI 병변 스크리닝 & Grad-CAM 시각화 (`POST /api/v1/records`)**
   * 실제 병변 이미지 업로드 및 실시간 미리보기 지원
   * Redis 기반 비동기 태스크 큐 처리 및 실시간 진행률(`0% ~ 100%`) 폴링
   * 원본 병변 이미지 위 Grad-CAM 히트맵 투명도 조절(`0% ~ 100%`) 및 Top-3 후보 질환 확률 분포 제공
2. **식약처 DUR 기반 의약품 안전 검증 (`GET /api/v1/reports/{task_id}`)**
   * 병변 발생 부위(예: 안면부 `FACE`)와 보유 의약품 강도(예: 스테로이드 1등급)를 교차 검증하여 금기 경고 배너 자동 출력
3. **맞춤형 FTU 정량 도포 및 RAG 복약 가이드**
   * 신체 부위별 권장 도포량(`FTU` 및 `g` 단위) 자동 환산 및 생활 습관·진료 시 의사 질문 3선 생성
   * Qdrant 벡터 검색을 통한 식약처/심평원 인용 출처 및 유사도 점수 명시
4. **보호자·가족용 큰 글씨 요약 안내서 공유 (`POST /api/v1/share/{task_id}`)**
   * 어르신 및 보호자가 쉽게 확인할 수 있는 24시간 유효 토큰 기반 큰 글씨 전용 리포트 뷰 제공
5. **복약·연고 도포 알림 스케줄러 (`POST /api/v1/schedules`)**
   * 의약품별 도포/복용 시간 등록, 목록 조회 및 실시간 `ON/OFF` 상태 토글 지원

---

## 🔧 주요 트러블슈팅 및 해결 과정

| 발생 문제 | 원인 분석 | 해결 조치 |
| :--- | :--- | :--- |
| **`ERR_CONNECTION_REFUSED` 및 CORS 차단** | 꺼져 있는 Live Server(`5500`) 포트로 접근하고, 백엔드 CORS 허용 목록에 Vite(`5173`) 포트가 누락됨 | 프론트엔드 접속 주소를 `localhost:5173`으로 통일하고 `.env`의 `ALLOWED_ORIGINS`에 `http://localhost:5173` 추가 후 서버 재시작 |
| **SQLAlchemy `NoForeignKeysError` / `InvalidRequestError`** | `models.py` 내 기존 `MedicationSchedule` 테이블과 신규 모델 간 중복 선언 및 양방향 `relationship` 불일치 발생 | 기존 스키마(`dosage_instruction`, `alert_time`)를 유지하도록 API 컬럼을 매핑하고 `CaregiverShare` 모델만 독립 추가하여 매퍼 충돌 해결 |
| **분석 요청(`202 Accepted`) 후 진행률 정체** | FastAPI 서버만 실행되고 Redis 큐 작업을 소비할 AI 워커 프로세스가 실행되지 않음 | 프로젝트 루트 경로 인식 오류 방지를 위해 모듈 형태(`python -m ai_worker.worker`)로 워커를 구동하여 비동기 파이프라인 정상화 |

---

## 📊 최종 통합 테스트 및 검증 결과

* **실제 병변 이미지 추론 검증 (`2025080601204_0.jpg`):**
  * 업로드 직후 원본 미리보기 출력 및 `COMPLETED (100%)` 파이프라인 정상 통과
  * 병소 중심 영역에 Grad-CAM 붉은 활성도 히트맵 정합 확인 (1순위: `지루성 피부염 24.4%`, 위험도: `HIGH_URGENT`)
* **DUR 경고 및 FTU 가이드 검증:**
  * 안면부(`FACE`) + `더모베이트연고0.05%` 조합 입력 시 초강력 스테로이드 안면부 사용 중단 경고 배너 출력 확인
  * 얼굴 및 목 전체 기준 `2.5 FTU (1.25g)` 도포 가이드 및 RAG 출처(`유사도 0.6945` 등) 정상 출력
* **부가 기능 검증:**
  * `21:00 · 리도멕스크림0.15%` 복약 알림 등록 및 `ON` 토글 상태 MySQL 영구 저장 확인
  * 보호자용 큰 글씨 공유 링크 발급 및 전용 요약 뷰 렌더링 정상 작동 확인
'@ | Set-Content -Path "docs/PROJECT_SUMMARY.md" -Encoding UTF8