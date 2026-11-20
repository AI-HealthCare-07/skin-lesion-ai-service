const TARGET_DISEASES = [
  { name: "지루성 피부염", tag: "피지·각질", desc: "두피·안면부 홍반과 노란 인설 동반" },
  { name: "아토피 피부염", tag: "만성·소양", desc: "극심한 가려움과 건조·태선화 병변" },
  { name: "접촉성 피부염", tag: "자극·알레르기", desc: "외부 물질 노출 부위 국소 발진·수포" },
  { name: "건선", tag: "은백색 인설", desc: "경계가 뚜렷한 붉은 판과 두꺼운 각질" },
  { name: "표재성 진균 감염", tag: "백선·칸디다", desc: "고리 모양 경계 확장 및 습윤 부위 병변" },
];

export default function ClinicalGuideCard() {
  return (
    <div className="card" style={{ padding: "1.4rem 1.6rem", marginTop: "1.1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.4rem" }}>
        <strong style={{ fontSize: "0.96rem", color: "#0f172a" }}>
          🩺 AI 스크리닝 주요 분석 범위 (5대 피부 질환)
        </strong>
        <span style={{ fontSize: "0.74rem", fontWeight: 700, color: "#0a4296", background: "#eff6ff", padding: "0.2rem 0.6rem", borderRadius: "999px" }}>
          ResNet50 멀티모달 분류
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.6rem", marginBottom: "1rem" }}>
        {TARGET_DISEASES.map((item) => (
          <div
            key={item.name}
            style={{
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "10px",
              padding: "0.7rem 0.85rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.2rem" }}>
              <strong style={{ fontSize: "0.84rem", color: "#1e293b" }}>{item.name}</strong>
              <span style={{ fontSize: "0.68rem", color: "#0d6efd", fontWeight: 700 }}>{item.tag}</span>
            </div>
            <div style={{ fontSize: "0.76rem", color: "#64748b", lineHeight: 1.4 }}>{item.desc}</div>
          </div>
        ))}
      </div>

      <div
        style={{
          background: "#fef2f2",
          border: "1px solid #fecaca",
          borderRadius: "10px",
          padding: "0.75rem 0.95rem",
          fontSize: "0.8rem",
          color: "#991b1b",
          lineHeight: 1.5,
        }}
      >
        <strong>🚨 즉시 응급실 내원이 필요한 레드플래그 증상:</strong> 38℃ 이상 고열, 전신으로 빠르게 번지는 물집·피부 벗겨짐, 입술·눈 점막 부종, 호흡곤란 또는 극심한 통증(8점 이상) 동반 시 자가 연고 도포를 중단하고 즉시 의료기관을 방문하세요.
      </div>
    </div>
  );
}