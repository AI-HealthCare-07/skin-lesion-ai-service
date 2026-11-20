export default function AppFooter() {
  return (
    <footer
      className="no-print"
      style={{
        marginTop: "2.5rem",
        padding: "1.4rem 1.5rem",
        background: "#f8fafc",
        borderTop: "1px solid #e2e8f0",
        color: "#475569",
        fontSize: "0.82rem",
        lineHeight: 1.6,
      }}
    >
      <div
        style={{
          maxWidth: "1280px",
          margin: "0 auto",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
        }}
      >
        <div>
          <strong style={{ color: "#0f172a", fontSize: "0.88rem" }}>
            🩺 MediGuide AI — 설명 가능한(XAI) 피부 병변 스크리닝 & 식약처 DUR 맞춤형 복약 가이드
          </strong>
          <p style={{ margin: "0.3rem 0 0 0", color: "#64748b" }}>
            ⚠️ <strong>의료 면책 안내:</strong> 본 시스템의 AI 분석 및 복약 가이드는 환자의 이해와 의료진 상담을 돕기 위한 임상 의사결정 보조(CDSS) 참고 자료이며, 의사의 전문적인 의학적 진단이나 처방을 대체할 수 없습니다.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
          <span style={{ background: "#eff6ff", color: "#0d6efd", padding: "0.25rem 0.6rem", borderRadius: "6px", fontWeight: 700, fontSize: "0.75rem" }}>
            ResNet50 · Grad-CAM
          </span>
          <span style={{ background: "#f0fdf4", color: "#15803d", padding: "0.25rem 0.6rem", borderRadius: "6px", fontWeight: 700, fontSize: "0.75rem" }}>
            식약처 DUR · RAG
          </span>
          <span style={{ background: "#fefce8", color: "#a16207", padding: "0.25rem 0.6rem", borderRadius: "6px", fontWeight: 700, fontSize: "0.75rem" }}>
            FTU 정량 계산기
          </span>
        </div>
      </div>
    </footer>
  );
}