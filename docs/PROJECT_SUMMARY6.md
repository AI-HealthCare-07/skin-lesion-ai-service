# MediGuide AI — 2026-11-25 작업 정리 및 트러블슈팅 로그

> **프로젝트 성격 안내:** 본 프로젝트는 단독 진행 중인 **진료 기록 기반 복약 안내 및 생활 습관 개선 가이드 자동 생성 시스템(MediGuide AI)**이며, 앞서 별도 연습으로 다룬 Stages 1~7 FastAPI 예시는 예시 과제 프로젝트입니다.

---

## 1. 오늘 진행한 주요 작업 내역

- **프런트엔드(`frontend/src/App.jsx`) 전체 구조 통합 및 UI/UX 고도화**
  - 과거 진단 히스토리 선택 시 문진 폼(부위, 증상, 가려움·통증 점수, 처방/보유 의약품) 자동 동기화
  - 다빈도 피부과 처방약 원클릭 빠른 추가 칩(`+ 더모베이트연고0.05%`, `+ 리도멕스크림0.15%`, `+ 에바스텔정10mg`, `+ 비판텐연고`) 구현
  - 좌측 `🧬 알레르기 · 기저질환 · 상세 메모` 아코디언 버튼 한 줄 정렬 및 줄바꿈 방지 처리
  - 복약·도포 알림 스케줄러 고도화(`🔔 ON` / `🔕 OFF` 직관 토글, `🔊 음성 미리듣기`, `🗑️ 삭제` 버튼)
  - `window.onbeforeprint` 이벤트 연동으로 진료용 PDF/인쇄 시 RAG 의학적 근거 출처 상세 보기 자동 펼침 및 카드 잘림 방지
  - 우측 하단 접이식(`<details>`) AI 복약·생활 Q&A 상담 플로팅 위젯 유지
- **실시간 헤더 시계 위젯(`nowText`) 복구**
  - `App()` 함수 내부에서 `useState`와 `useEffect`(`1000ms` 간격)를 사용해 실시간 날짜·요일·시각을 갱신하고 `<header>` 영역에 표시하도록 구성
- **리포트 표시 데이터 안정화**
  - 1순위 예측 질환 확률 표시 시 `primary_confidence`가 없을 경우 `top3_candidates[0].probability`로 안전하게 폴백 처리
  - FTU 권장 도포량 표시 시 `estimated_grams`가 숫자일 때만 `g` 단위를 출력해 빈 괄호 `(g)` 노출 방지
  - 의약품 가이드 요약(`parseMedicationSummary`)에서 스테로이드 등급/항히스타민 배지와 본문 항목(효능·효과, 용법·용량, 주의사항 등)을 분리 파싱하도록 개선

---

## 2. 주요 문제점 및 해결 과정

### ① `alertHelper.js` 내 `parseMedicationSummary` 내보내기 누락으로 인한 흰 화면
- **문제점:** `App.jsx`에서 `parseMedicationSummary`를 불러왔으나 `/src/alertHelper.js`에 해당 함수가 `export`되지 않아 브라우저 콘솔에 `Uncaught SyntaxError: The requested module '/src/alertHelper.js' does not provide an export named 'parseMedicationSummary'` 오류가 발생하며 화면이 렌더링되지 않음.
- **해결 방법:** `frontend/src/alertHelper.js`에 `parseMedicationSummary` 함수를 구현하고 `export function parseMedicationSummary(...)`로 내보내어 모듈 참조 오류를 해결함.

### ② 스타일시트(`App.css`) 미적용 및 문법 오류로 인한 레이아웃 붕괴
- **문제점:** 초기에는 `main.jsx`에 `./App.css` 임포트가 누락되어 있었고, 이후 `App.css` 수정 과정에서 전역 선택자 `* {`가 `- {`로 오타가 나거나 파일 말미에 불필요한 문자열이 섞여 CSS 파싱이 중단되면서 2단 그리드와 카드 스타일이 무너짐.
- **해결 방법:** `main.jsx`에 `import './App.css'`를 추가하고, `App.css`의 `- {` 오타를 `* {`로 수정한 뒤 `App.jsx`의 클래스(`app-shell`, `top-nav`, `main-grid`, `screening-grid`, `gradcam-frame`, `btn-primary` 등) 및 인쇄(`@media print`) 규칙과 일치하도록 정리함.

### ③ 분석 요청 시 `Not Found` 상태 발생
- **문제점:** 비동기 분석 요청 후 파이프라인 상태가 `FAILED`로 표시되며 `요청 오류: Not Found` 메시지가 노출됨.
- **해결 방법:** 백엔드 컨테이너(`backend`, `ai_worker`) 및 API 엔드포인트(`POST /api/v1/analyze/async`, `/api/v1/tasks/{task_id}`, `/api/v1/reports/{task_id}`) 상태를 점검·복구하여 비동기 분석이 `COMPLETED` 단계까지 정상 완료되도록 확인함.

### ④ `primary_confidence` 부재로 인한 `NaN%` 표시 및 FTU 그램 단위 `(g)` 빈 괄호 노출
- **문제점:** `report.screening.primary_confidence`가 숫자가 아닐 때 `(undefined * 100).toFixed(1)` 연산 결과가 `NaN%`로 표시되었고, `estimated_grams` 값이 없을 때 `(g)`가 그대로 출력됨.
- **해결 방법:** `primary_confidence`가 숫자인지 먼저 검증하고 없으면 `top3_candidates[0].probability`를 사용하도록 보완했으며, `estimated_grams`가 숫자일 때만 `(${estimated_grams}g)`가 붙도록 조건을 추가함.

### ⑤ JSX 내부 배열 옵셔널 체이닝(`?.[0]`) 구문 오류
- **문제점:** `App.jsx`의 1순위 예측 질환 확률 계산식에서 `top3_candidates?.[0]?.probability`를 작성했을 때 에디터/파서에서 구문 빨간 줄이 발생함.
- **해결 방법:** `report.screening?.top3_candidates && report.screening.top3_candidates[0] ? report.screening.top3_candidates[0].probability : null` 형태로 명시적 조건 체크로 변경하여 구문 오류를 제거함.

### ⑥ React Hook(`useState`, `useEffect`) 최상위 스코프 배치 문제
- **문제점:** 실시간 시계(`nowText`) 상태와 `setInterval` 타이머를 `export default function App()` 함수 외부 최상위 영역에 배치하여 React Hook 규칙 위반 위험이 발생함.
- **해결 방법:** `nowText`의 `useState`와 `useEffect`를 `export default function App()` 컴포넌트 함수 내부로 이동하여 정상적인 훅 실행 스코프를 확보함.

---

## 3. 내일 이어서 진행할 항목 및 Git 업로드 가이드

- **내일 진행할 항목:** 문진 입력용 **주요 자각 증상 프리셋** 칩 추가 여부 및 `MedicationCabinetTab` / `ModelRagDashboardTab` 별도 탭 연결 검토.
- **로컬 `docs/` 저장 및 GitHub 업로드 명령어 예시:**

```powershell
cd C:\projects\AI-based-web-service-project
git status
git add docs/ frontend/
git commit -m "docs: 2026-11-25 프런트엔드 UI 안정화 및 트러블슈팅 내역 정리"
git push
```