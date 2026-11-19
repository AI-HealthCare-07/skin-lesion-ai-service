const RED_FLAG_RULES = [
  { keywords: ["고열", "발열", "오한", "열감"], label: "전신 발열·오한 동반 (봉와직염·전신 감염 의심)" },
  { keywords: ["수포", "물집", "벗겨짐", "표피박리"], label: "광범위 수포·피부 박리 (중증 약물발진·수포성 질환 의심)" },
  { keywords: ["점막", "입술", "구강", "눈 주위", "결막"], label: "점막(입술·눈·구강) 침범 소견 (SJS/TEN 감별 필요)" },
  { keywords: ["호흡곤란", "숨이", "어지럼", "입술 부종", "목 부음"], label: "급성 혈관부종·아나필락시스 위험 징후" },
  { keywords: ["고름", "농포", "악취", "괴사", "심한 진물"], label: "2차 세균 감염 또는 조직 괴사 의심" },
];

export default function EmergencyTriageBanner({ symptoms = "", userMemo = "", painScore = 0 }) {
  const combinedText = `${symptoms} ${userMemo}`;
  const matchedFlags = RED_FLAG_RULES.filter((rule) =>
    rule.keywords.some((kw) => combinedText.includes(kw))
  );

  if (Number(painScore) >= 8) {
    matchedFlags.push({
      label: `극심한 통증 지수 (${painScore}/10점) — 단순 소양증을 넘어선 급성 염증·대상포진 등 감별 필요`,
    });
  }

  if (matchedFlags.length === 0) return null;

  return (
    <div
      style={{
        background: "#fef2f2",
        border: "2px solid #dc2626",
        borderLeft: "8px solid #b91c1c",
        borderRadius: "12px",
        padding: "1rem 1.2rem",
        marginBottom: "1rem",
        color: "#7f1d1d",
        boxShadow: "0 4px 12px rgba(220, 38, 38, 0.14)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
        <strong style={{ fontSize: "1.05rem", color: "#b91c1c" }}>
          🚨 [응급 트리아제 경보] 즉시 전문의 또는 응급 의료기관 내원이 필요합니다!
        </strong>
        <a
          href="https://map.naver.com/p/search/응급실"
          target="_blank"
          rel="noreferrer"
          style={{
            background: "#dc2626",
            color: "#ffffff",
            textDecoration: "none",
            padding: "0.35rem 0.75rem",
            borderRadius: "8px",
            fontSize: "0.82rem",
            fontWeight: 700,
          }}
        >
          🚑 가까운 응급실 찾기
        </a>
      </div>

      <ul style={{ margin: "0.55rem 0 0.45rem 0", paddingLeft: "1.25rem", fontSize: "0.9rem", fontWeight: 600 }}>
        {matchedFlags.map((f, idx) => (
          <li key={idx}>{f.label}</li>
        ))}
      </ul>

      <div style={{ fontSize: "0.84rem", color: "#991b1b" }}>
        ※ 레드플래그(위험 징후)가 감지된 상태에서는 자가 연고 도포나 경과 관찰을 중단하고 즉시 병원을 방문하세요.
      </div>
    </div>
  );
}