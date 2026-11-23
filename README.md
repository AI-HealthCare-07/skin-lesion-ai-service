# 🩺 MediGuide AI
> **설명 가능한(XAI) 피부 병변 스크리닝 및 식약처 DUR 기반 맞춤형 복약·생활 가이드 플랫폼**

![Python](https://img.shields.io/badge/Python-3.11-3776AB?style=flat-square&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=flat-square&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=flat-square&logo=vite&logoColor=white)
![Docker](https://img.shields.io/badge/Docker_Compose-Fullstack-2496ED?style=flat-square&logo=docker&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-EDA_Queue-DC382D?style=flat-square&logo=redis&logoColor=white)
![Qdrant](https://img.shields.io/badge/Qdrant-Vector_RAG-FF4B4B?style=flat-square)

---

## 📌 프로젝트 개요

**MediGuide AI**는 피부 병변 이미지와 환자 문진 데이터(발생 부위, 가려움·통증 지수, 처방·보유 의약품, 기저질환·알레르기)를 결합하여 **1차 피부 질환 스크리닝(Grad-CAM 시각화)**과 **식약처 의약품안전나라(e약은요) · 심평원 DUR 기준 맞춤형 복약 가이드**를 제공하는 풀스택 AI 헬스케어 웹 서비스입니다.

* **비동기 이벤트 기반(EDA) 추론 분리:** API 서버와 무거운 딥러닝·RAG 워커를 `Redis` 태스크 큐로 분리하여 병목 없이 실시간 진행률(`0% → 100%`)을 추적합니다.
* **환자 중심 안전 설계(CDSS):** 안면부(`FACE`) 초강력 스테로이드 금기 경고, 동일 효능군(외용 스테로이드) 중복 도포 주의 알림, 부위별 **FTU(Finger-Tip Unit) 정량 도포 가이드**를 자동 산출합니다.
* **진료 연계 및 접근성 강화:** 의료진 제출용 **A4 PDF 인쇄 레이아웃**, 보호자용 **큰 글씨·음성(TTS) 공유 링크**, 처방전 OCR 자동 입력 및 복약 알림 스케줄러를 지원합니다.

---

## 🏗️ 시스템 아키텍처 (Event-Driven Architecture)

```text
[React + Vite Frontend (:5173)]
       │  REST API / FormData / Polling
       ▼
[FastAPI Backend (:8000)] ──▶ [MySQL 8.0] (환자 문진 · 진단 이력 · 복약 스케줄 · 공유 토큰)
       │
       │  Task Push (task_id)
       ▼
[Redis 7 Task Queue]
       │
       ▼
[Python AI Inference Worker]
  ├── 1. PyTorch ResNet50 피부 병변 분류 + Grad-CAM 히트맵 오버레이 생성
  ├── 2. Qdrant Vector DB 의학·의약품 지식 검색 (RAG)
  └── 3. 식약처 e약은요 · 심평원 DUR 금기·중복 검증 & FTU 정량 계산

  ✨ 핵심 기능 상세

  구분,주요 기능,구현 내용
1. 다중 문진 & OCR,환자 문진 및 처방전 자동 입력,"발생 부위(FACE, NECK, TRUNK 등), 자각 증상(가려움/통증 0~10점), 발병·연고 도포 이력, 알레르기·기저질환 선택 및 처방전 이미지 OCR 자동 추출"
2. XAI 병변 스크리닝,딥러닝 분류 & Grad-CAM 시각화,"Top-1 예측 질환·신뢰도, Top-3 후보 질환 확률 분포 막대, 실시간 히트맵 투명도(0~100%) 조절 슬라이더"
3. 맞춤형 복약 & DUR,식약처·심평원 기반 안전 가이드,"부위별 권장 도포량(FTU / g 환산), 약품별 등급 배지(1등급 초강력, 2세대 항히스타민제 등) 및 효능·용법·주의사항 구조화, 안면부 금기 · 스테로이드 중복 도포 경고"
4. 리포트 연동 AI 상담,문맥 기반 후속 Q&A 챗봇,현재 진단된 질환명과 처방약 DUR 데이터를 컨텍스트로 결합한 실시간 복약·생활 Q&A 상담 (추천 질문 칩 지원)
5. 진료 준비 & 복약 관리,PDF 출력 · 가족 공유 · 알림,"진료용 PDF 인쇄 최적화(상담창·입력폼 자동 숨김), 보호자용 큰 글씨 + 한국어 TTS 공유 뷰, 약품 카드 원클릭 복약 알림 스케줄 등록, 과거 경과 추이 그래프"

📂 디렉터리 구조

AI-based-web-service-project/
├── app/                        # FastAPI 백엔드 애플리케이션 (API 라우터, JWT 인증, DB 모델, DUR 로직)
├── worker/                     # Redis 비동기 AI 추론 워커 (ResNet50, Grad-CAM, Qdrant RAG 파이프라인)
├── frontend/                   # React + Vite 프론트엔드 SPA
│   └── src/
│       ├── App.jsx             # 메인 대시보드, 2단 문진/XAI 및 하단 2열 복약·Q&A 레이아웃
│       ├── ReportChatBox.jsx   # 진단 리포트 연동 AI 복약·생활 Q&A 상담 컴포넌트
│       ├── PersonalDurBanner.jsx # 개인 알레르기·기저질환·부위별 DUR 경고 배너
│       ├── EmergencyTriageBanner.jsx # 응급 증상 트리아지 경고 배너
│       └── alertHelper.js      # 브라우저 푸시 알림 및 Web Speech API 한국어 TTS 유틸
├── scripts/                    # 모델 학습(train_derm_model.py) 및 Qdrant 벡터 적재(ingest_rag_data.py)
├── docs/                       # 단계별 설계 명세서 및 트러블슈팅 히스토리
├── docker-compose.fullstack.yml # MySQL, Redis, Qdrant, Backend, Worker, Frontend 통합 오케스트레이션
├── Dockerfile.backend          # 백엔드 및 AI 워커 공용 Python 환경 이미지
└── start_all.ps1               # Windows 환경 원클릭 실행 스크립트

