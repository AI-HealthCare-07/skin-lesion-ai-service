import { useState } from "react";

const DRUG_DUR_DICTIONARY = [
  {
    name: "더모베이트연고0.05%",
    ingredient: "클로베타솔프로피오네이트",
    category: "외용 스테로이드 (1등급 · 초강력)",
    potencyLevel: 1,
    maxDuration: "최대 1~2주 이내 단기 사용",
    bannedAreas: "얼굴(안면부), 눈 주위, 목, 사타구니, 겨드랑이",
    safeAreas: "손바닥, 발바닥, 두꺼운 판상 건선·태선화 병변",
    interactionNote: "다른 스테로이드 외용제와 동일 부위 중복 도포 금지. 밀봉(밴드·랩) 요법 시 전신 흡수 급증 주의.",
    moisturizerOrder: "보습제 먼저 도포 → 15분 흡수 후 환부에만 1 FTU 기준 극소량 얇게 도포",
  },
  {
    name: "리도멕스크림0.15%",
    ingredient: "프레드니솔론발레로아세테이트",
    category: "외용 스테로이드 (5등급 · 약함)",
    potencyLevel: 5,
    maxDuration: "최대 2~3주 이내 사용 (증상 호전 시 감량)",
    bannedAreas: "눈 점막, 개방성 상처, 세균·진균 감염 부위 단독 사용",
    safeAreas: "얼굴(단기 제한적 사용), 목, 팔·다리·몸통 습진",
    interactionNote: "비교적 순한 등급이나 2주 이상 연속 연용 시 피부 얇아짐 주의. 호전 시 보습제 단독 유지로 전환 권장.",
    moisturizerOrder: "보습제 도포 15분 후 얇게 펴 바름 (소아·안면부는 전문의 지시 용량 준수)",
  },
  {
    name: "에바스텔정10mg",
    ingredient: "에바스틴",
    category: "경구 2세대 항히스타민제",
    potencyLevel: 0,
    maxDuration: "처방 일수 준수 (1일 1회 1정 경구 복용)",
    bannedAreas: "중증 간장애 환자, 임부·수유부 임의 복용 주의",
    safeAreas: "전신 두드러기, 알레르기성 소양증(가려움) 완화",
    interactionNote: "1세대 대비 졸음이 적으나 개인차로 나른함 발생 가능. 복용 중 음주 및 진정제 병용 금지.",
    moisturizerOrder: "식사와 관계없이 물과 함께 복용 (연고 도포 및 보습 관리와 병행 시 가려움 완화 시너지)",
  },
  {
    name: "비판텐연고",
    ingredient: "덱스판테놀 (비타민 B5 전구체)",
    category: "비(非)스테로이드 피부 재생·보습 연고",
    potencyLevel: 0,
    maxDuration: "기간 제한 없이 일상 보습·장벽 회복용 사용 가능",
    bannedAreas: "감염성 진물·고름이 심한 화농성 병변 단독 밀봉 주의",
    safeAreas: "얼굴, 입술, 영유아 기저귀 발진, 민감 부위, 스테로이드 휴약기",
    interactionNote: "스테로이드 성분이 없어 내성·피부 위축 우려가 적으며, 스테로이드 감량(테이퍼링) 시 대체 보습제로 적합.",
    moisturizerOrder: "세안 직후 단독 도포 또는 처방 스테로이드 도포 전후 피부 장벽 보호용으로 활용",
  },
  {
    name: "에스로반연고",
    ingredient: "무피로신",
    category: "국소 외용 항생제",
    potencyLevel: 0,
    maxDuration: "1일 2~3회, 최대 10일 이내 사용 (내성균 예방)",
    bannedAreas: "안과용(눈 점막) 사용 금지, 광범위 화상·신장애 환자 장기 도포 주의",
    safeAreas: "2차 세균 감염이 의심되는 농가진, 모낭염, 긁힌 상처 부위",
    interactionNote: "10일 이상 장기 연용 시 내성균 증식 위험이 있으므로 호전되지 않으면 진료 재확인 필요.",
    moisturizerOrder: "환부 세척·건조 후 면봉으로 소량 도포 (보습제와 섞어 바르지 않고 별도 도포 권장)",
  },
  {
    name: "데소나로션0.05%",
    ingredient: "데소나이드",
    category: "외용 스테로이드 (6등급 · 매우 약함)",
    potencyLevel: 6,
    maxDuration: "최대 2~4주 이내 단기 사용",
    bannedAreas: "바이러스성(단순포진·수두)·진균성 피부 감염 부위",
    safeAreas: "안면부, 접히는 부위, 넓은 부위 경증 아토피·지루성 피부염",
    interactionNote: "로션 제형으로 털이 있는 부위나 넓은 면적에 펴 바르기 용이하나 고강도 연고와 중복 도포 금지.",
    moisturizerOrder: "보습제 도포 15분 후 얇게 도포",
  },
];

const POTENCY_COLORS = {
  1: "#dc2626",
  2: "#ea580c",
  3: "#f59e0b",
  4: "#eab308",
  5: "#84cc16",
  6: "#22c55e",
  7: "#10b981",
};

export default function MedicationCabinetTab({ currentMedications = "", onApplyToForm }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("ALL");
  const [savedCabinet, setSavedCabinet] = useState(() => {
    try {
      const raw = localStorage.getItem("mediguide_my_cabinet");
      return raw ? JSON.parse(raw) : ["더모베이트연고0.05%", "리도멕스크림0.15%", "에바스텔정10mg"];
    } catch {
      return ["더모베이트연고0.05%", "리도멕스크림0.15%", "에바스텔정10mg"];
    }
  });

  const toggleCabinetDrug = (drugName) => {
    setSavedCabinet((prev) => {
      const next = prev.includes(drugName) ? prev.filter((d) => d !== drugName) : [...prev, drugName];
      localStorage.setItem("mediguide_my_cabinet", JSON.stringify(next));
      return next;
    });
  };

  const filteredDrugs = DRUG_DUR_DICTIONARY.filter((item) => {
    const matchesQuery =
      !searchQuery.trim() ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.ingredient.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.category.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesQuery) return false;
    if (selectedFilter === "MY_CABINET") return savedCabinet.includes(item.name);
    if (selectedFilter === "STEROID") return item.potencyLevel > 0;
    if (selectedFilter === "NON_STEROID") return item.potencyLevel === 0;
    return true;
  });

  const cabinetSteroids = DRUG_DUR_DICTIONARY.filter(
    (d) => savedCabinet.includes(d.name) && d.potencyLevel > 0
  );

  return (
    <div style={{ maxWidth: "1080px", margin: "1.5rem auto", padding: "0 1.25rem" }}>
      {/* 상단 요약 & 내 약통 중복 안전 점검 카드 */}
      <div className="card" style={{ marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem", marginBottom: "0.85rem" }}>
          <div>
            <h2 className="card-title" style={{ margin: 0 }}>💊 내 약통 관리 & 식약처 DUR 의약품 안전 사전</h2>
            <p className="form-hint" style={{ margin: "0.3rem 0 0 0" }}>
              집에 보유한 연고·먹는 약을 등록해 중복 투여 위험을 미리 점검하고, 문진 폼으로 바로 불러올 수 있습니다.
            </p>
          </div>
          {onApplyToForm && savedCabinet.length > 0 && (
            <button
              type="button"
              onClick={() => onApplyToForm(savedCabinet.join(", "))}
              className="btn-submit"
              style={{ width: "auto", padding: "0.55rem 1rem", fontSize: "0.86rem" }}
            >
              📥 내 약통 ({savedCabinet.length}종) 문진 폼에 일괄 적용 →
            </button>
          )}
        </div>

        {/* 내 약통 보유 칩 목록 */}
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "0.85rem 1rem", marginBottom: cabinetSteroids.length >= 2 ? "0.85rem" : 0 }}>
          <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#334155", marginBottom: "0.5rem" }}>
            🏠 현재 내 약통에 보관 중인 의약품 ({savedCabinet.length}종)
          </div>
          {savedCabinet.length === 0 ? (
            <div style={{ fontSize: "0.82rem", color: "#64748b" }}>보관 중인 약품이 없습니다. 아래 사전에서 [+ 내 약통 담기]를 눌러 등록해 보세요.</div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
              {savedCabinet.map((drug) => (
                <span
                  key={drug}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    background: "#eff6ff",
                    border: "1px solid #bfdbfe",
                    color: "#1d4ed8",
                    borderRadius: "999px",
                    padding: "0.28rem 0.72rem",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                  }}
                >
                  💊 {drug}
                  <button
                    type="button"
                    onClick={() => toggleCabinetDrug(drug)}
                    style={{ border: "none", background: "transparent", color: "#64748b", cursor: "pointer", fontWeight: 700, padding: 0 }}
                    title="약통에서 제거"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {cabinetSteroids.length >= 2 && (
          <div className="alert-danger" style={{ marginBottom: 0 }}>
            <strong>⚠️ [내 약통 DUR 중복 주의] 외용 스테로이드 {cabinetSteroids.length}종 동시 보관 중</strong>
            <div>
              현재 약통에 <strong>{cabinetSteroids.map((d) => `${d.name}(${d.potencyLevel}등급)`).join(", ")}</strong>이 함께 등록되어 있습니다. 증상 부위에 따라 강도를 구분해 사용하시고, 동일 부위에 겹쳐 바르지 않도록 주의하세요.
            </div>
          </div>
        )}
      </div>

      {/* 검색 및 필터 바 */}
      <div className="card" style={{ marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center", marginBottom: "1rem" }}>
          <input
            type="text"
            className="form-control"
            placeholder="🔍 약품명, 성분명(예: 클로베타솔, 덱스판테놀), 효능군 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ flex: "1 1 260px" }}
          />
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            {[
              { id: "ALL", label: `전체 (${DRUG_DUR_DICTIONARY.length})` },
              { id: "MY_CABINET", label: `🏠 내 약통 (${savedCabinet.length})` },
              { id: "STEROID", label: "📊 스테로이드 외용제" },
              { id: "NON_STEROID", label: "🛡️ 비스테로이드·경구약" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedFilter(tab.id)}
                style={{
                  border: selectedFilter === tab.id ? "1.5px solid #0d6efd" : "1px solid #cbd5e1",
                  background: selectedFilter === tab.id ? "#eff6ff" : "#ffffff",
                  color: selectedFilter === tab.id ? "#0d6efd" : "#475569",
                  borderRadius: "999px",
                  padding: "0.38rem 0.8rem",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* 약품 사전 카드 리스트 */}
        <div style={{ display: "grid", gap: "0.9rem" }}>
          {filteredDrugs.map((item) => {
            const inCabinet = savedCabinet.includes(item.name);
            const isHighRisk = item.potencyLevel > 0 && item.potencyLevel <= 2;

            return (
              <div
                key={item.name}
                className="med-item"
                style={{
                  margin: 0,
                  padding: "1.05rem 1.15rem",
                  background: "#ffffff",
                  border: inCabinet ? "1.5px solid #93c5fd" : "1px solid #e2e8f0",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.55rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    <strong style={{ fontSize: "1.02rem", color: "#0f172a" }}>💊 {item.name}</strong>
                    <span
                      style={{
                        fontSize: "0.73rem",
                        fontWeight: 700,
                        padding: "0.2rem 0.58rem",
                        borderRadius: "999px",
                        background: isHighRisk ? "#fee2e2" : item.potencyLevel > 0 ? "#fef3c7" : "#ecfdf5",
                        color: isHighRisk ? "#b91c1c" : item.potencyLevel > 0 ? "#b45309" : "#047857",
                      }}
                    >
                      {item.category}
                    </span>
                    <span style={{ fontSize: "0.76rem", color: "#64748b" }}>성분: {item.ingredient}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleCabinetDrug(item.name)}
                    style={{
                      border: inCabinet ? "1px solid #0d6efd" : "1px solid #cbd5e1",
                      background: inCabinet ? "#0d6efd" : "#f8fafc",
                      color: inCabinet ? "#ffffff" : "#334155",
                      borderRadius: "8px",
                      padding: "0.35rem 0.75rem",
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {inCabinet ? "✓ 내 약통 보관됨" : "+ 내 약통 담기"}
                  </button>
                </div>

                {/* 스테로이드 등급 미니 스펙트럼 바 */}
                {item.potencyLevel > 0 && (
                  <div style={{ marginBottom: "0.6rem" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px" }}>
                      {[1, 2, 3, 4, 5, 6, 7].map((lv) => {
                        const active = lv === item.potencyLevel;
                        return (
                          <div
                            key={lv}
                            style={{
                              height: active ? "14px" : "8px",
                              alignSelf: "center",
                              borderRadius: "4px",
                              background: POTENCY_COLORS[lv],
                              opacity: active ? 1 : 0.25,
                              border: active ? "1.5px solid #0f172a" : "none",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "0.62rem",
                              fontWeight: 800,
                              color: "#fff",
                            }}
                          >
                            {active ? `${lv}등급` : ""}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0.55rem", fontSize: "0.82rem", color: "#334155", lineHeight: 1.5 }}>
                  <div style={{ background: "#f8fafc", padding: "0.55rem 0.75rem", borderRadius: "8px" }}>
                    <strong style={{ color: "#b91c1c" }}>🚫 금기·주의 부위:</strong> {item.bannedAreas}
                  </div>
                  <div style={{ background: "#f8fafc", padding: "0.55rem 0.75rem", borderRadius: "8px" }}>
                    <strong style={{ color: "#15803d" }}>✅ 권장 적용 부위:</strong> {item.safeAreas}
                  </div>
                  <div style={{ background: "#f8fafc", padding: "0.55rem 0.75rem", borderRadius: "8px" }}>
                    <strong style={{ color: "#0369a1" }}>⏱️ 사용 기간 · 순서:</strong> {item.maxDuration} / {item.moisturizerOrder}
                  </div>
                  <div style={{ background: "#f8fafc", padding: "0.55rem 0.75rem", borderRadius: "8px" }}>
                    <strong style={{ color: "#b45309" }}>⚠️ DUR 상호작용 주의:</strong> {item.interactionNote}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}