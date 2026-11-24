import { useState } from "react";

const SAMPLE_CASES = [
  {
    id: "dur_steroid",
    badge: "DUR 금기 검증 체험",
    badgeColor: "#b45309",
    badgeBg: "#fef3c7",
    title: "안면부 홍반 + 초강력 스테로이드 연고",
    desc: "얼굴 부위와 1등급 스테로이드(더모베이트) 조합 시 식약처 DUR 안전 경고를 즉시 확인합니다.",
    data: {
      bodyPart: "FACE",
      symptoms: "홍반, 각질, 가려움",
      itchScore: 7,
      painScore: 2,
      medications: "더모베이트연고0.05%, 에바스텔정10mg",
      userMemo: "양볼과 코 주변이 붉어지고 각질이 일어나며 가렵습니다.",
      allergies: [],
      conditions: [],
    },
  },
  {
    id: "emergency_flag",
    badge: "응급 트리아제 체험",
    badgeColor: "#b91c1c",
    badgeBg: "#fee2e2",
    title: "고열 · 광범위 수포 · 심한 통증",
    desc: "레드플래그 응급 증상 입력 시 최상단 적색 경보 배너 및 주변 응급실 연계를 확인합니다.",
    data: {
      bodyPart: "TRUNK",
      symptoms: "광범위 수포, 진물, 고열, 심한 화끈거림",
      itchScore: 4,
      painScore: 9,
      medications: "에스로반연고, 타이레놀정500mg",
      userMemo: "어제부터 몸통에 물집이 빠르게 번지고 열이 나며 통증이 심합니다.",
      allergies: ["ANTIBIOTIC"],
      conditions: ["DIABETES"],
    },
  },

// 스테로이드 중복 경고 & 1·5등급 강도 게이지 비교 시연 케이스
  {
    id: "steroid_duplicate",
    badge: "스테로이드 중복 · 강도 비교",
    badgeColor: "#1d4ed8",
    badgeBg: "#dbeafe",
    title: "팔 습진 + 1등급·5등급 스테로이드 중복 보유",
    desc: "강도가 다른 외용 스테로이드 2종 동시 입력 시 동일 효능군 중복 경고와 1~7등급 게이지 차이를 비교합니다.",
    data: {
      bodyPart: "ARM",
      symptoms: "홍반(붉어짐), 각질·인설, 심한 가려움",
      itchScore: 8,
      painScore: 1,
      medications: "더모베이트연고0.05%, 리도멕스크림0.15%, 비판텐연고",
      userMemo: "팔 안쪽 접히는 부위가 붉고 가려워서 집에 있던 연고 두 가지를 같이 바르려 합니다.",
      allergies: [],
      conditions: [],
    },
  },
  //
  ];

const TARGET_DISEASES = [
  { name: "지루성 피부염", tag: "피지·각질", desc: "두피·안면부 홍반과 노란 인설 동반" },
  { name: "아토피 피부염", tag: "만성·소양", desc: "극심한 가려움과 건조·태선화 병변" },
  { name: "접촉성 피부염", tag: "자극·알레르기", desc: "외부 물질 노출 부위 국소 발진·수포" },
  { name: "건선", tag: "은백색 인설", desc: "경계가 뚜렷한 붉은 판과 두꺼운 각질" },
  { name: "표재성 진균 감염", tag: "백선·칸디다", desc: "고리 모양 경계 확장 및 습윤 부위 병변" },
];

export default function MainWelcomePanel({ onApplySample }) {
  const [guideTab, setGuideTab] = useState("workflow");

  return (
    <div className="card" style={{ padding: "1.5rem" }}>
      {/* 상단 배지 및 탭 전환 버튼 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.6rem", marginBottom: "0.9rem" }}>
        <span
          style={{
            background: "#eff6ff",
            color: "#0d6efd",
            fontWeight: 700,
            fontSize: "0.76rem",
            padding: "0.25rem 0.65rem",
            borderRadius: "999px",
            border: "1px solid #bfdbfe",
          }}
        >
          AI 임상 의사결정 보조 시스템 (CDSS)
        </span>

        <div style={{ display: "flex", background: "#f1f5f9", padding: "0.22rem", borderRadius: "10px", gap: "0.25rem" }}>
          <button
            type="button"
            onClick={() => setGuideTab("workflow")}
            style={{
              border: "none",
              borderRadius: "8px",
              padding: "0.35rem 0.75rem",
              fontSize: "0.8rem",
              fontWeight: 700,
              cursor: "pointer",
              background: guideTab === "workflow" ? "#ffffff" : "transparent",
              color: guideTab === "workflow" ? "#0a4296" : "#64748b",
              boxShadow: guideTab === "workflow" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
            }}
          >
            🚀 시연 · 이용 가이드
          </button>
          <button
            type="button"
            onClick={() => setGuideTab("clinical")}
            style={{
              border: "none",
              borderRadius: "8px",
              padding: "0.35rem 0.75rem",
              fontSize: "0.8rem",
              fontWeight: 700,
              cursor: "pointer",
              background: guideTab === "clinical" ? "#ffffff" : "transparent",
              color: guideTab === "clinical" ? "#0a4296" : "#64748b",
              boxShadow: guideTab === "clinical" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
            }}
          >
            🩺 5대 질환 · 응급 기준
          </button>
        </div>
      </div>

      {guideTab === "workflow" ? (
        <>
          <h2 style={{ margin: "0 0 0.4rem 0", fontSize: "1.26rem", color: "#0f172a" }}>
            병변 사진을 업로드하고 맞춤형 복약 가이드를 받아보세요
          </h2>
          <p style={{ margin: "0 0 1.1rem 0", fontSize: "0.88rem", color: "#475569", lineHeight: 1.55 }}>
            환부 이미지와 자각 증상, 보유 의약품을 입력하면 시각적 근거(Grad-CAM) 분석부터 식약처 DUR 안전 검증, 정량 도포(FTU) 안내까지 한 번에 생성됩니다.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(185px, 1fr))", gap: "0.75rem", marginBottom: "1.1rem" }}>
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "0.9rem" }}>
              <div style={{ fontSize: "1.2rem", marginBottom: "0.25rem" }}>🔬</div>
              <strong style={{ fontSize: "0.88rem", color: "#0a4296", display: "block", marginBottom: "0.2rem" }}>
                1. XAI 병변 스크리닝
              </strong>
              <div style={{ fontSize: "0.8rem", color: "#475569", lineHeight: 1.45 }}>
                ResNet50 모델로 5대 피부 질환을 예측하고 Grad-CAM 히트맵으로 근거 부위를 시각화합니다.
              </div>
            </div>

            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "0.9rem" }}>
              <div style={{ fontSize: "1.2rem", marginBottom: "0.25rem" }}>🛡️</div>
              <strong style={{ fontSize: "0.88rem", color: "#0f766e", display: "block", marginBottom: "0.2rem" }}>
                2. 3중 DUR · 응급 검증
              </strong>
              <div style={{ fontSize: "0.8rem", color: "#475569", lineHeight: 1.45 }}>
                부위별 금기 약물, 개인 알레르기·기저질환 교차 검증, 응급 레드플래그를 즉시 탐지합니다.
              </div>
            </div>

            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "0.9rem" }}>
              <div style={{ fontSize: "1.2rem", marginBottom: "0.25rem" }}>💊</div>
              <strong style={{ fontSize: "0.88rem", color: "#b45309", display: "block", marginBottom: "0.2rem" }}>
                3. FTU 정량 · 진료 연계
              </strong>
              <div style={{ fontSize: "0.8rem", color: "#475569", lineHeight: 1.45 }}>
                부위별 연고 적정 도포량 계산, 음성 복약 알림, 진료용 PDF 및 보호자 공유를 지원합니다.
              </div>
            </div>
          </div>

          {onApplySample && (
            <div style={{ marginBottom: "1rem" }}>
              <div style={{ fontSize: "0.84rem", fontWeight: 700, color: "#1e293b", marginBottom: "0.5rem" }}>
                🧪 대표 임상 케이스 1초 자동 입력 (시연 · 빠른 체험용)
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "0.7rem" }}>
                {SAMPLE_CASES.map((sc) => (
                  <button
                    key={sc.id}
                    type="button"
                    onClick={() => onApplySample(sc.data)}
                    style={{
                      textAlign: "left",
                      background: "#ffffff",
                      border: "1px solid #cbd5e1",
                      borderRadius: "12px",
                      padding: "0.8rem 0.95rem",
                      cursor: "pointer",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        color: sc.badgeColor,
                        background: sc.badgeBg,
                        padding: "0.15rem 0.5rem",
                        borderRadius: "999px",
                        marginBottom: "0.3rem",
                      }}
                    >
                      {sc.badge}
                    </span>
                    <div style={{ fontWeight: 700, fontSize: "0.86rem", color: "#0f172a", marginBottom: "0.18rem" }}>
                      {sc.title} →
                    </div>
                    <div style={{ fontSize: "0.76rem", color: "#64748b", lineHeight: 1.4 }}>{sc.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div
            style={{
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: "10px",
              padding: "0.75rem 0.95rem",
              fontSize: "0.82rem",
              color: "#166534",
              lineHeight: 1.5,
            }}
          >
            <strong>📸 촬영 팁:</strong> 밝은 실내 조명 아래에서 병변 중심부가 선명하게 보이도록 촬영해 주세요. 처방전이 있다면 좌측 <strong>[📄 처방전 OCR 자동입력]</strong>으로 약품명을 바로 불러올 수 있습니다.
          </div>
        </>
      ) : (
        <>
          <h2 style={{ margin: "0 0 0.4rem 0", fontSize: "1.22rem", color: "#0f172a" }}>
            AI 스크리닝 주요 분석 범위 (5대 피부 질환)
          </h2>
          <p style={{ margin: "0 0 1rem 0", fontSize: "0.86rem", color: "#475569", lineHeight: 1.5 }}>
            ResNet50 멀티모달 분류 모델이 임상에서 빈번한 5대 피부 병변의 시각적 패턴과 문진 지표를 종합 분석합니다.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(195px, 1fr))", gap: "0.65rem", marginBottom: "1rem" }}>
            {TARGET_DISEASES.map((item) => (
              <div
                key={item.name}
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "10px",
                  padding: "0.75rem 0.85rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.22rem" }}>
                  <strong style={{ fontSize: "0.86rem", color: "#1e293b" }}>{item.name}</strong>
                  <span style={{ fontSize: "0.7rem", color: "#0d6efd", fontWeight: 700 }}>{item.tag}</span>
                </div>
                <div style={{ fontSize: "0.78rem", color: "#64748b", lineHeight: 1.4 }}>{item.desc}</div>
              </div>
            ))}
          </div>

          <div
            style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "10px",
              padding: "0.8rem 0.95rem",
              fontSize: "0.82rem",
              color: "#991b1b",
              lineHeight: 1.55,
            }}
          >
            <strong>🚨 즉시 응급실 내원이 필요한 레드플래그 증상:</strong> 38℃ 이상 고열, 전신으로 빠르게 번지는 물집·피부 벗겨짐, 입술·눈 점막 부종, 호흡곤란 또는 극심한 통증(8점 이상) 동반 시 자가 연고 도포를 중단하고 즉시 의료기관을 방문하세요.
          </div>
        </>
      )}
    </div>
  );
}