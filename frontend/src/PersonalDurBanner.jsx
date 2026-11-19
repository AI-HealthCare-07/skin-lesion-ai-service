const ALLERGY_RULES = [
  {
    id: "STEROID",
    label: "스테로이드 외용제 알레르기",
    drugKeywords: ["더모베이트", "리도멕스", "스테로이드", "클로베타솔", "프레드니솔론", "라벤다"],
    warning: "보유 의약품 중 국소 스테로이드 성분이 포함되어 있습니다. 과거 접촉성 알레르기 이력이 있으므로 도포를 중단하고 비스테로이드성 대체제(칼시뉴린 억제제 등)를 처방받으세요.",
  },
  {
    id: "ANTIBIOTIC",
    label: "국소 항생제(무피로신·바시트라신) 알레르기",
    drugKeywords: ["베아로반", "에스로반", "무피로신", "후시딘", "항생제"],
    warning: "국소 항생제 연고 성분에 대한 과민반응 이력이 선택되었습니다. 발진·가려움이 악화될 수 있으니 사용 전 약사·의사에게 알리세요.",
  },
  {
    id: "ANTIHISTAMINE",
    label: "항히스타민제 과민반응 / 심한 졸음",
    drugKeywords: ["에바스텔", "지르텍", "씨잘", "항히스타민", "에바스틴"],
    warning: "항히스타민제 계열 약물이 포함되어 있습니다. 과거 과민반응이나 심한 진정 작용이 있었다면 복용 전 복약 지도를 받으세요.",
  },
];

const CONDITION_RULES = [
  {
    id: "PREGNANT",
    label: "임신부 · 수유부",
    check: (meds, part) =>
      meds.includes("더모베이트") || meds.includes("스테로이드") || meds.includes("에바스텔"),
    warning: "임신·수유 중에는 고강도 스테로이드(1등급) 광범위 도포 및 일부 경구 항히스타민제 사용 시 태아·영아 안전성 등급 확인이 필수적입니다.",
  },
  {
    id: "ELDERLY_CHILD",
    label: "소아 · 고령자 (얇은 피부)",
    check: (meds, part) =>
      meds.includes("더모베이트") || part === "FACE" || part === "NECK",
    warning: "소아와 고령자는 피부 장벽이 얇아 외용제 전신 흡수율이 높습니다. 초강력 스테로이드 사용을 피하고 저강도 연고를 최소 면적에만 도포하세요.",
  },
  {
    id: "DIABETES",
    label: "당뇨병 · 면역저하 질환",
    check: () => true,
    warning: "당뇨·면역저하 환자는 스테로이드 장기 도포 시 국소 2차 세균·진균(곰팡이) 감염 위험이 크게 높아지므로 혈당 변화와 환부 삼출물을 면밀히 관찰하세요.",
  },
  {
    id: "GLAUCOMA",
    label: "녹내장 · 백내장 이력",
    check: (meds, part) => part === "FACE" && (meds.includes("더모베이트") || meds.includes("리도멕스") || meds.includes("스테로이드")),
    warning: "안면부(특히 눈 주위) 스테로이드 외용제 도포 시 안압 상승으로 녹내장·백내장이 악화될 수 있으므로 눈 주변 도포를 엄격히 금합니다.",
  },
];

export default function PersonalDurBanner({
  medications = "",
  bodyPart = "",
  selectedAllergies = [],
  selectedConditions = [],
}) {
  const triggeredWarnings = [];

  ALLERGY_RULES.forEach((rule) => {
    if (selectedAllergies.includes(rule.id)) {
      const matchedDrug = rule.drugKeywords.find((kw) => medications.includes(kw));
      if (matchedDrug) {
        triggeredWarnings.push({
          tag: `알레르기 교차금기 · ${rule.label}`,
          message: `[${matchedDrug}] ${rule.warning}`,
        });
      }
    }
  });

  CONDITION_RULES.forEach((rule) => {
    if (selectedConditions.includes(rule.id) && rule.check(medications, bodyPart)) {
      triggeredWarnings.push({
        tag: `기저질환 DUR 주의 · ${rule.label}`,
        message: rule.warning,
      });
    }
  });

  if (triggeredWarnings.length === 0) return null;

  return (
    <div
      style={{
        background: "#fffbeb",
        border: "1.5px solid #f59e0b",
        borderLeft: "7px solid #d97706",
        borderRadius: "12px",
        padding: "0.95rem 1.15rem",
        marginBottom: "1rem",
        color: "#78350f",
      }}
    >
      <strong style={{ fontSize: "0.98rem", color: "#b45309", display: "block", marginBottom: "0.45rem" }}>
        🧬 [개인 맞춤 체질·기저질환 DUR 추가 경고 ({triggeredWarnings.length}건)]
      </strong>
      <div style={{ display: "grid", gap: "0.45rem", fontSize: "0.88rem" }}>
        {triggeredWarnings.map((item, idx) => (
          <div key={idx} style={{ background: "rgba(255,255,255,0.7)", padding: "0.5rem 0.7rem", borderRadius: "8px" }}>
            <strong style={{ color: "#92400e" }}>• {item.tag}:</strong> {item.message}
          </div>
        ))}
      </div>
    </div>
  );
}