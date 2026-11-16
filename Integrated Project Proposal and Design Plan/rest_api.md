# [프로젝트] AI 기반 피부 병변 스크리닝 및 맞춤형 복약·생활 가이드 웹서비스

## REST API 정의서 (v1.0)

### 1. API 설계 개요 및 공통 규약
* **Base URL:** `https://api.skincare-ai.example.com/api/v1`
* **통신 프로토콜 및 데이터 포맷:** HTTPS / `application/json` (단, 이미지 업로드 API는 `multipart/form-data` 사용)
* **인증 방식:** JWT (JSON Web Token) 기반 Bearer Authentication
  * Header 예시: `Authorization: Bearer <access_token>`
* **비동기 처리 규약 (Async AI Pipeline):**
  * AI 이미지 스크리닝 및 RAG 가이드 생성 요청(`POST /records`)은 클라이언트 타임아웃을 방지하기 위해 즉시 `202 Accepted`와 `task_id`를 반환하며, 클라이언트는 상태 조회 API(`GET /tasks/{task_id}`) 또는 SSE 스트림을 통해 진행률을 추적한다.

#### 1.1 공통 응답 포맷 (Standard Response Envelope)
```json
{
  "success": true,
  "code": "SUCCESS",
  "message": "요청이 정상적으로 처리되었습니다.",
  "data": { ... },
  "timestamp": "2026-11-16T14:30:00+09:00"
}
```

#### 1.2 주요 HTTP 상태 코드 및 에러 코드
| HTTP 상태 코드 | 에러 코드 | 설명 |
| :---: | :--- | :--- |
| `200 OK` | `SUCCESS` | 조회 및 수정 요청 정상 처리 |
| `201 Created` | `CREATED` | 신규 리소스(회원, 스케줄, 공유 링크 등) 생성 완료 |
| `202 Accepted` | `TASK_QUEUED` | 비동기 AI 분석 작업이 Redis 큐에 정상 등록됨 |
| `400 Bad Request` | `INVALID_INPUT` | 필수 파라미터 누락, 허용되지 않은 이미지 확장자 등 |
| `401 Unauthorized` | `UNAUTHORIZED` | 유효하지 않거나 만료된 JWT 토큰 |
| `404 Not Found` | `RESOURCE_NOT_FOUND` | 존재하지 않는 진료 기록, 작업 ID 또는 만료된 공유 링크 |
| `422 Unprocessable Entity` | `OCR_EXTRACTION_FAILED` | 처방전 이미지 해상도 불량으로 약품명 인식 불가 |
| `500 Internal Server Error` | `AI_PIPELINE_ERROR` | AI 추론 워커 또는 벡터 DB 검색 내부 오류 |

---

### 2. API 엔드포인트 요약표 (Endpoint Summary)

| 도메인 | Method | URI | 설명 | 관련 화면 | 인증 |
| :--- | :---: | :--- | :--- | :---: | :---: |
| **회원/프로필** | `POST` | `/auth/signup` | 회원가입 | - | X |
| **회원/프로필** | `POST` | `/auth/login` | 로그인 및 JWT 발급 | - | X |
| **회원/프로필** | `GET` | `/users/me/profile` | 내 건강 프로필(기저질환, 알레르기, 임부 여부) 조회 | SCR-05 | O |
| **회원/프로필** | `PUT` | `/users/me/profile` | 내 건강 프로필 및 상시 복용약 수정 | SCR-05 | O |
| **문진/업로드** | `POST` | `/ocr/prescription` | 처방전/약봉투 이미지 OCR 스캔 및 약품명 추출 | SCR-02 | O |
| **문진/업로드** | `POST` | `/records` | 병변 이미지 및 문진 데이터 등록 + **비동기 AI 분석 요청** | SCR-02 | O |
| **문진/업로드** | `GET` | `/records` | 과거 진료/분석 히스토리 목록 조회 (경과 비교용 필터 포함) | SCR-06 | O |
| **비동기 상태** | `GET` | `/tasks/{task_id}` | AI 분석 작업 진행률 및 상태 단건 조회 (Polling) | SCR-03 | O |
| **비동기 상태** | `GET` | `/tasks/{task_id}/stream` | AI 분석 작업 진행률 실시간 스트리밍 (SSE) | SCR-03 | O |
| **리포트/공유** | `GET` | `/reports/{task_id}` | 통합 리포트(스크리닝, Grad-CAM, RAG 가이드, DUR 경고) 조회 | SCR-04 | O |
| **리포트/공유** | `POST` | `/reports/{task_id}/share` | 보호자 공유용 비로그인 임시 링크 토큰 생성 | SCR-04 | O |
| **리포트/공유** | `GET` | `/shared/{share_token}` | 보호자용 큰 글씨 요약 리포트 조회 | SCR-07 | X |
| **복약 스케줄** | `POST` | `/schedules` | 리포트 처방 기반 복약·연고 도포 알림 등록 | SCR-04 | O |
| **복약 스케줄** | `GET` | `/schedules/today` | 대시보드 오늘의 복약 스케줄 및 스테로이드 트래커 조회 | SCR-01 | O |
| **복약 스케줄** | `PATCH` | `/schedules/{schedule_id}/check` | 일일 복약/연고 도포 완료 상태 토글 | SCR-01 | O |

---

### 3. 도메인별 상세 API 명세

#### 3.1 회원 및 건강 프로필 (`/users`)

##### ① 건강 프로필 수정 (`PUT /api/v1/users/me/profile`)
* **설명:** 기저질환, 알레르기 성분, 임신/수유 여부 및 상시 복용약 정보를 업데이트한다. 해당 정보는 RAG 및 DUR 병용금기 필터링의 기준 데이터로 활용된다.
* **Request Body (`application/json`):**
```json
{
  "birth_date": "1995-04-12",
  "gender": "F",
  "underlying_diseases": ["아토피피부염", "알레르기비염"],
  "drug_allergies": ["페니실린", "라놀린"],
  "is_pregnant_or_nursing": false,
  "regular_medications": ["오메가3", "종합비타민"]
}
```
* **Response (`200 OK`):**
```json
{
  "success": true,
  "code": "SUCCESS",
  "message": "건강 프로필이 업데이트되었습니다.",
  "data": {
    "user_id": 101,
    "updated_at": "2026-11-16T14:35:00+09:00"
  }
}
```

---

#### 3.2 처방전 OCR 및 병변 분석 요청 (`/ocr`, `/records`)

##### ① 처방전/약봉투 OCR 추출 (`POST /api/v1/ocr/prescription`)
* **설명:** 사용자가 업로드한 처방전이나 약봉투 사진에서 텍스트를 추출하고, 식약처 의약품 동의어 사전과 매핑하여 정규화된 약품명 리스트를 반환한다.
* **Request (`multipart/form-data`):**
  * `file`: 처방전/약봉투 이미지 파일 (`JPG`, `PNG`, 최대 10MB)
* **Response (`200 OK`):**
```json
{
  "success": true,
  "code": "SUCCESS",
  "message": "처방약 인식이 완료되었습니다.",
  "data": {
    "raw_ocr_text": "에바스텔정 1정 1일1회 / 더모베이트연고 15g 외용",
    "detected_medications": [
      {
        "item_seq": "199801234",
        "drug_name": "에바스텔정(에바스틴)",
        "category": "항히스타민제",
        "confidence": 0.96
      },
      {
        "item_seq": "200105678",
        "drug_name": "더모베이트연고0.05%",
        "category": "외용스테로이드(1등급)",
        "confidence": 0.94
      }
    ]
  }
}
```

##### ② 피부 병변 분석 및 가이드 생성 요청 (`POST /api/v1/records`)
* **설명:** 병변 이미지와 문진 정보를 DB(`SKIN_RECORDS`, `LESION_IMAGES`)에 저장하고, Redis 메시지 큐에 비동기 AI 추론 및 RAG 파이프라인 작업을 등록한다.
* **Request (`multipart/form-data`):**
  * `images`: 병변 이미지 파일 배열 (`JPG`, `PNG`, 최대 3장)
  * `payload`: JSON 문자열
    ```json
    {
      "body_part": "FACE",
      "symptoms_morphology": ["홍반", "인설"],
      "itch_score": 6,
      "pain_score": 2,
      "duration": "1주 이내",
      "user_memo": "볼 주변이 붉어지고 각질이 일어나며 가렵습니다.",
      "current_medications": ["에바스텔정(에바스틴)", "더모베이트연고0.05%"],
      "apply_deidentification": true
    }
    ```
* **Response (`202 Accepted`):**
```json
{
  "success": true,
  "code": "TASK_QUEUED",
  "message": "AI 분석 작업이 접수되었습니다.",
  "data": {
    "record_id": 502,
    "task_id": "8f9e4b2c-1a3d-4e5f-9b8c-7d6e5f4a3b2c",
    "status": "PENDING",
    "estimated_seconds": 10
  }
}
```

---

#### 3.3 비동기 작업 상태 트래킹 (`/tasks`)

##### ① 분석 작업 상태 조회 (`GET /api/v1/tasks/{task_id}`)
* **설명:** 클라이언트가 대기 화면(`SCR-03`)에서 작업 진행 상태를 폴링(1.5초 간격)할 때 호출한다.
* **Response (`200 OK`):**
```json
{
  "success": true,
  "code": "SUCCESS",
  "data": {
    "task_id": "8f9e4b2c-1a3d-4e5f-9b8c-7d6e5f4a3b2c",
    "status": "PROCESSING",
    "progress_percent": 70,
    "current_step": "RAG_RETRIEVAL",
    "step_description": "식약처 e약은요 및 심평원 DUR 금기사항 대조 중...",
    "error_message": null
  }
}
```
* **진행 단계(`current_step`) 정의:**
  * `PREPROCESSING` (10%): 이미지 전처리 및 개인정보 비식별화
  * `VISION_INFERENCE` (40%): 피부 병변 AI 스크리닝 및 Grad-CAM 생성
  * `RAG_RETRIEVAL` (70%): DUR 금기 검증 및 벡터 DB 근거 검색
  * `GUIDE_GENERATION` (90%): LLM 기반 맞춤형 복약·생활 가이드 생성
  * `COMPLETED` (100%): 전체 파이프라인 완료

---

#### 3.4 통합 스크리닝·가이드 리포트 및 보호자 공유 (`/reports`, `/shared`)

##### ① 통합 리포트 상세 조회 (`GET /api/v1/reports/{task_id}`)
* **설명:** 작업 상태가 `COMPLETED`가 된 후, 결과 화면(`SCR-04`)에 렌더링할 모든 AI 스크리닝 결과와 RAG 가이드를 반환한다.
* **Response (`200 OK`):**
```json
{
  "success": true,
  "code": "SUCCESS",
  "data": {
    "report_id": "20261116-502",
    "created_at": "2026-11-16T14:30:12+09:00",
    "disclaimer": "본 결과는 AI 분석에 기반한 참고용 정보이며, 의사의 전문적인 의학적 진단을 대체할 수 없습니다.",
    "screening": {
      "original_image_url": "https://cdn.skincare-ai.example.com/lesions/502_orig.jpg",
      "gradcam_image_url": "https://cdn.skincare-ai.example.com/lesions/502_cam.jpg",
      "primary_disease_code": "L23.9",
      "primary_disease_name": "접촉성 피부염",
      "confidence_score": 0.785,
      "risk_level": "MODERATE",
      "top3_candidates": [
        { "disease_name": "접촉성 피부염", "probability": 0.785 },
        { "disease_name": "아토피 피부염", "probability": 0.152 },
        { "disease_name": "지루성 피부염", "probability": 0.041 }
      ],
      "visual_finding_summary": "안면부 경계가 비교적 명확한 홍반과 미세 인설 패턴이 관찰됩니다."
    },
    "guide": {
      "dur_warnings": [
        {
          "severity": "HIGH",
          "warning_type": "BODY_PART_CONTRAINDICATION",
          "drug_name": "더모베이트연고0.05%",
          "message": "1등급 초강력 스테로이드 외용제는 안면부(얼굴) 사용 시 피부 위축 및 모세혈관 확장 위험이 높으므로 전문의 확인 전 도포를 중단하세요."
        }
      ],
      "medication_guide": [
        {
          "drug_name": "에바스텔정(에바스틴)",
          "dosage": "성인 기준 1일 1회 10mg(1정) 경구 복용",
          "precautions": "졸음을 유발할 수 있으므로 운전이나 위험한 기계 조작 시 주의하십시오.",
          "source_id": "MFDS_199801234_03"
        }
      ],
      "ftu_dosage_guide": {
        "body_part_label": "얼굴 및 목 전체",
        "recommended_ftu": 2.5,
        "recommended_grams": 1.25,
        "instruction": "검지 손가락 끝마디 한 줄(1 FTU = 약 0.5g) 기준으로 얼굴 전체에는 약 2.5마디 분량을 보습제 도포 15분 후 얇게 펴 바릅니다."
      },
      "lifestyle_guide": [
        "미온수(32~34°C)로 자극이 적은 약산성 클렌저를 사용해 짧게 세안하세요.",
        "세안 후 3분 이내에 무향료·저자극 보습제를 충분히 도포하세요.",
        "실내 습도를 45~55%로 유지하고 새로운 화장품이나 향료 접촉을 피하세요."
      ],
      "doctor_questions": [
        "현재 처방받은 연고가 얼굴 부위에 사용하기에 강도가 높지 않은지 확인하고 싶습니다.",
        "가려움증이 가라앉은 후 연고 중단 및 보습제 단독 유지 시점은 언제가 좋을까요?",
        "항히스타민제 복용 후 낮 시간 졸음이 심할 경우 다른 성분으로 변경할 수 있을까요?"
      ],
      "retrieved_sources": [
        {
          "doc_id": "MFDS_199801234_03",
          "organization": "식품의약품안전처 의약품안전나라",
          "title": "에바스텔정(에바스틴) 의약품 개요정보(e약은요)"
        },
        {
          "doc_id": "MFDS_200105678_04",
          "organization": "식품의약품안전처 의약품안전나라",
          "title": "더모베이트연고0.05% 사용상 주의사항 (부위별 금기)"
        },
        {
          "doc_id": "KDA_GUIDE_2025_08",
          "organization": "대한피부과학회",
          "title": "외용 스테로이드제 안전 사용 및 FTU 정량 도포 가이드라인"
        }
      ]
    }
  }
}
```

##### ② 보호자 공유 링크 생성 (`POST /api/v1/reports/{task_id}/share`) & 조회 (`GET /api/v1/shared/{share_token}`)
* **생성 Response (`201 Created`):**
```json
{
  "success": true,
  "code": "CREATED",
  "data": {
    "share_url": "https://skincare-ai.example.com/shared/shr_9a8b7c6d5e4f",
    "expires_at": "2026-11-23T14:30:12+09:00"
  }
}
```

---

#### 3.5 복약 스케줄 및 스테로이드 트래커 (`/schedules`)

##### ① 오늘의 복약 스케줄 및 스테로이드 트래커 조회 (`GET /api/v1/schedules/today`)
* **설명:** 메인 대시보드(`SCR-01`) 진입 시 오늘 복용/도포해야 할 약물 목록과 스테로이드 연속 사용 일수 경고 상태를 반환한다.
* **Response (`200 OK`):**
```json
{
  "success": true,
  "code": "SUCCESS",
  "data": {
    "date": "2026-11-16",
    "schedules": [
      {
        "schedule_id": 301,
        "drug_name": "에바스텔정",
        "dosage_instruction": "아침 식후 30분 1정 복용",
        "alert_time": "08:30:00",
        "is_completed": true
      },
      {
        "schedule_id": 302,
        "drug_name": "리도멕스크림 0.3%",
        "dosage_instruction": "저녁 세안 후 환부에 얇게 도포",
        "alert_time": "21:00:00",
        "is_completed": false
      }
    ],
    "steroid_tracker": {
      "active": true,
      "drug_name": "리도멕스크림 0.3%",
      "potency_class": 5,
      "consecutive_days": 5,
      "recommended_max_days": 7,
      "warning_message": "권장 연속 사용 기간(7일)까지 2일 남았습니다. 장기 연용 시 휴약기가 필요합니다."
    }
  }
}
```