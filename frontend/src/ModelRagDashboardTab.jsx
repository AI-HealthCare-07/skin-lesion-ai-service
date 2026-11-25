import { useState } from "react";

const ARCHITECTURE_STAGES = [
  {
    step: "STAGE 01",
    title: "비동기 문진·영상 수집 & OCR 정제",
    tech: "FastAPI · PyTesseract · Fuzzy Normalization",
    color: "#0d6efd",
    bg: "#eff6ff",
    points: [
      "환부 이미지 EXIF 개인정보 자동 파기 후 UUID 기반 격리 저장 (추론 완료 즉시 원본 자동 삭제)",
      "처방전 OCR 추출 및 약물명 표기 변형·오타(difflib 유사도 0.72+) 표준 약품명 정규화",
      "Redis Queue(`mediguide:analysis_queue`) 비동기 작업 발행 및 실시간 진행률 폴링",
    ],
  },
  {
    step: "STAGE 02",
    title: "설명 가능한(XAI) 5대 피부 병변 스크리닝",
    tech: "PyTorch · ResNet50 · Grad-CAM Heatmap",
    color: "#0f766e",
    bg: "#f0fdfa",
    points: [
      "지루성·아토피·접촉성 피부염, 건선, 표재성 진균 감염 등 5대 다빈도 피부 병변 분류",
      "Grad-CAM 마지막 합성곱 계층 활성화 맵 추출로 모델이 주목한 병변 영역 시각화",
      "예측 신뢰도 15% 미만 저화질·비병변 입력 시 오인식 차단 및 재촬영 안내 방어 로직",
    ],
  },
  {
    step: "STAGE 03",
    title: "식약처 DUR · Qdrant 벡터 RAG 안전 파이프라인",
    tech: "BAAI/bge-m3 · Qdrant · 3중 Rule-Based DUR",
    color: "#b45309",
    bg: "#fffbeb",
    points: [
      "상위 6개 후보 문서 1차 검색 후 실제 입력 처방약 일치 문서 최상단 리랭킹(Re-ranking)",
      "3중 DUR 교차 검증: ① 안면·경부 고강도 스테로이드 금기 ② 동일 효능군 중복 ③ 임부·알레르기·기저질환",
      "환각(Hallucination) 억제를 위한 식약처 e약은요·피부과학회 근거 문서 ID(Citation) 명시",
    ],
  },
  {
    step: "STAGE 04",
    title: "환자 맞춤형 FTU 도포량 & 임상 사후 연계",
    tech: "FTU Calculator · Web Speech TTS · PDF Print",
    color: "#6d28d9",
    bg: "#f5f3ff",
    points: [
      "발생 부위별 체표면적 기반 1회 적정 도포량(1 FTU = 0.5g) 자동 산출 및 보습제 15분 간격 가이드",
      "진료실 제출용 PDF 인쇄 레이아웃, 보호자용 큰 글씨 공유 링크(24시간 토큰), 음성 복약 알림 제공",
      "현재 리포트 질환·부위·처방약·DUR 경고를 컨텍스트로 바인딩한 맞춤형 Q&A 상담 챗봇 연동",
    ],
  },
];

const SAFETY_GUARDRAILS = [
  {
    title: "🛡️ 이중 안전 검증 (Hybrid AI + Rule-Based DUR)",
    desc: "벡터 유사도 검색(RAG)에만 의존하지 않고, 식약처·심평원 기준의 결정론적(Rule-Based) 부위 금기 및 중복 투여 규칙을 결합해 치명적 오남용을 차단합니다.",
  },
  {
    title: "🔒 개인정보 및 의료 영상 보안 수명주기",
    desc: "업로드 시 GPS·기기 EXIF 메타데이터를 제거하고, AI 워커의 추론 및 Grad-CAM 생성이 완료되는 즉시 원본 환부 파일을 서버 디스크에서 파기합니다.",
  },
  {
    title: "⚖️ 의료법 준수 CDSS 면책 및 응급 트리아제",
    desc: "모든 리포트에 의사 진료 대체 불가 면책 고지를 포함하며, 고열·광범위 수포·극심한 통증 등 레드플래그 감지 시 자가 도포를 중단시키고 응급실 연계를 우선 안내합니다.",
  },
];

export default function ModelRagDashboardTab({ historyCount = 0, onGoAnalyze }) {
  const [selectedStageIdx, setSelectedStageIdx] = useState(0);

  return (
    <div style={{ maxWidth: "1080px", margin: "1.5rem auto", padding: "0 1.25rem" }}>
      {/* 상단 시스템 아키텍처 브리핑 헤더 */}
      <div className="card" style={{ marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1rem" }}>
          <div>
            <span
              style={{
                display: "inline-block",
                fontSize: "0.73rem",
                fontWeight: 700,
                color: "#0a4296",
                background: "#dbeafe",
                padding: "0.2rem 0.62rem",
                borderRadius: "999px",
                marginBottom: "0.35rem",
              }}
            >
              XAI + MFDS DUR RAG Hybrid Architecture
            </span>
            <h2 className="card-title" style={{ margin: 0 }}>
              🧠 MediGuide AI 모델 파이프라인 & 식약처 DUR 지식 검색 검증 대시보드
            </h2>
          </div>

          {onGoAnalyze && (
            <button
              type="button"
              onClick={onGoAnalyze}
              className="btn-submit"
              style={{ width: "auto", padding: "0.55rem 1rem", fontSize: "0.86rem" }}
            >
              🔬 실제 파이프라인 시연하러 가기 →
            </button>
          )}
        </div>

        {/* 핵심 지표 KPI 4종 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem" }}>
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "0.85rem 1rem" }}>
            <div style={{ fontSize: "0.76rem", color: "#64748b", fontWeight: 600 }}>비전 추론 & XAI 엔진</div>
            <strong style={{ fontSize: "1.12rem", color: "#0d6efd", display: "block", marginTop: "0.2rem" }}>ResNet50 + Grad-CAM</strong>
            <div style={{ fontSize: "0.75rem", color: "#475569", marginTop: "0.15rem" }}>5대 피부 질환 분류 & 근거 히트맵</div>
          </div>

          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "0.85rem 1rem" }}>
            <div style={{ fontSize: "0.76rem", color: "#64748b", fontWeight: 600 }}>임베딩 & 벡터 검색 DB</div>
            <strong style={{ fontSize: "1.12rem", color: "#0f766e", display: "block", marginTop: "0.2rem" }}>BAAI/bge-m3 · Qdrant</strong>
            <div style={{ fontSize: "0.75rem", color: "#475569", marginTop: "0.15rem" }}>처방약 우선 리랭킹 & 출처 인용</div>
          </div>

          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "0.85rem 1rem" }}>
            <div style={{ fontSize: "0.76rem", color: "#64748b", fontWeight: 600 }}>임상 의약품 안전 검증</div>
            <strong style={{ fontSize: "1.06rem", color: "#b45309", display: "block", marginTop: "0.2rem", wordBreak: "keep-all" }}>3중 DUR · 1~7등급 게이지</strong>
            <div style={{ fontSize: "0.75rem", color: "#475569", marginTop: "0.15rem" }}>부위 금기 · 중복 투여 · 프로필 교차</div>
          </div>

          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "0.85rem 1rem" }}>
            <div style={{ fontSize: "0.76rem", color: "#64748b", fontWeight: 600 }}>비동기 워커 & 누적 검증 건수</div>
            <strong style={{ fontSize: "1.06rem", color: "#6d28d9", display: "block", marginTop: "0.2rem", wordBreak: "keep-all" }}>Redis Queue · {historyCount}건 완료</strong>
            <div style={{ fontSize: "0.75rem", color: "#475569", marginTop: "0.15rem" }}>FastAPI · AI Worker · MySQL 8.0</div>
          </div>
        </div>
      </div>

      {/* 4단계 End-to-End 파이프라인 인터랙티브 다이어그램 */}
      <div className="card" style={{ marginBottom: "1.25rem" }}>
        <h3 className="card-title" style={{ marginBottom: "0.35rem" }}>
          ⚙️ End-to-End 4단계 비동기 AI · RAG 처리 흐름 (단계를 클릭해 상세 검증)
        </h3>
        <p className="form-hint" style={{ margin: "0 0 1rem 0" }}>
          환자 문진 접수부터 XAI 히트맵 생성, 식약처 DUR 검증 및 맞춤형 복약 가이드 조립까지의 내부 동작 구조입니다.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.65rem", marginBottom: "1rem" }}>
          {ARCHITECTURE_STAGES.map((st, idx) => {
            const isSelected = selectedStageIdx === idx;
            return (
              <button
                key={st.step}
                type="button"
                onClick={() => setSelectedStageIdx(idx)}
                style={{
                  textAlign: "left",
                  padding: "0.85rem 0.95rem",
                  borderRadius: "12px",
                  border: isSelected ? `2px solid ${st.color}` : "1px solid #cbd5e1",
                  background: isSelected ? st.bg : "#ffffff",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    fontSize: "0.7rem",
                    fontWeight: 800,
                    color: st.color,
                    marginBottom: "0.25rem",
                  }}
                >
                  {st.step}
                </span>
                <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#0f172a", marginBottom: "0.2rem" }}>
                  {st.title}
                </div>
                <div style={{ fontSize: "0.74rem", color: "#64748b", fontWeight: 600 }}>{st.tech}</div>
              </button>
            );
          })}
        </div>

        {/* 선택된 단계 상세 명세 박스 */}
        {(() => {
          const activeStage = ARCHITECTURE_STAGES[selectedStageIdx];
          return (
            <div
              style={{
                background: activeStage.bg,
                border: `1px solid ${activeStage.color}40`,
                borderRadius: "12px",
                padding: "1rem 1.15rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.6rem" }}>
                <strong style={{ fontSize: "0.96rem", color: activeStage.color }}>
                  [{activeStage.step}] {activeStage.title}
                </strong>
                <span style={{ fontSize: "0.76rem", fontWeight: 700, color: "#334155", background: "#ffffff", padding: "0.2rem 0.6rem", borderRadius: "6px" }}>
                  핵심 스택: {activeStage.tech}
                </span>
              </div>
              <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.85rem", color: "#1e293b", lineHeight: 1.65 }}>
                {activeStage.points.map((pt, i) => (
                  <li key={i}>{pt}</li>
                ))}
              </ul>
            </div>
          );
        })()}
      </div>

      {/* 임상 안전 가드레일 3원칙 */}
      <div className="card" style={{ marginBottom: 0 }}>
        <h3 className="card-title">🛡️ 임상 안전성 · 환각 억제 · 데이터 보안 3대 가드레일</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "0.8rem" }}>
          {SAFETY_GUARDRAILS.map((g) => (
            <div
              key={g.title}
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "12px",
                padding: "0.95rem 1.05rem",
              }}
            >
              <strong style={{ fontSize: "0.9rem", color: "#0f172a", display: "block", marginBottom: "0.35rem" }}>
                {g.title}
              </strong>
              <p style={{ margin: 0, fontSize: "0.81rem", color: "#475569", lineHeight: 1.55 }}>{g.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}