export default function MainWelcomePanel() {
  return (
    <div className="card" style={{ padding: "1.6rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.6rem" }}>
        <span
          style={{
            background: "#eff6ff",
            color: "#0d6efd",
            fontWeight: 700,
            fontSize: "0.78rem",
            padding: "0.25rem 0.65rem",
            borderRadius: "999px",
            border: "1px solid #bfdbfe",
          }}
        >
          AI 임상 의사결정 보조 시스템 (CDSS)
        </span>
      </div>

      <h2 style={{ margin: "0 0 0.45rem 0", fontSize: "1.32rem", color: "#0f172a" }}>
        병변 사진을 업로드하고 맞춤형 복약 가이드를 받아보세요
      </h2>
      <p style={{ margin: "0 0 1.25rem 0", fontSize: "0.9rem", color: "#475569", lineHeight: 1.6 }}>
        환부 이미지와 자각 증상, 보유 의약품을 입력하면 시각적 근거(Grad-CAM) 분석부터 식약처 DUR 안전 검증, 정량 도포(FTU) 안내까지 한 번에 생성됩니다.
      </p>

      {/* 3단계 핵심 파이프라인 요약 카드 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "0.85rem", marginBottom: "1.25rem" }}>
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "1rem" }}>
          <div style={{ fontSize: "1.3rem", marginBottom: "0.35rem" }}>🔬</div>
          <strong style={{ fontSize: "0.92rem", color: "#0a4296", display: "block", marginBottom: "0.25rem" }}>
            1. XAI 병변 스크리닝
          </strong>
          <div style={{ fontSize: "0.82rem", color: "#475569", lineHeight: 1.5 }}>
            ResNet50 멀티모달 모델로 5대 주요 피부 질환을 예측하고 Grad-CAM 히트맵으로 주목 부위를 시각화합니다.
          </div>
        </div>

        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "1rem" }}>
          <div style={{ fontSize: "1.3rem", marginBottom: "0.35rem" }}>🛡️</div>
          <strong style={{ fontSize: "0.92rem", color: "#0f766e", display: "block", marginBottom: "0.25rem" }}>
            2. 3중 DUR · 응급 안전 검증
          </strong>
          <div style={{ fontSize: "0.82rem", color: "#475569", lineHeight: 1.5 }}>
            부위별 금기 약물, 개인 알레르기·기저질환 교차 검증, 응급 레드플래그 증상을 즉시 탐지합니다.
          </div>
        </div>

        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "1rem" }}>
          <div style={{ fontSize: "1.3rem", marginBottom: "0.35rem" }}>💊</div>
          <strong style={{ fontSize: "0.92rem", color: "#b45309", display: "block", marginBottom: "0.25rem" }}>
            3. FTU 정량 & 진료 연계
          </strong>
          <div style={{ fontSize: "0.82rem", color: "#475569", lineHeight: 1.5 }}>
            부위별 연고 적정 도포량 계산, 음성 복약 알림, 진료용 PDF 출력 및 보호자 큰 글씨 공유를 지원합니다.
          </div>
        </div>
      </div>

      {/* 정확한 촬영 가이드 안내 */}
      <div
        style={{
          background: "#f0fdf4",
          border: "1px solid #bbf7d0",
          borderRadius: "10px",
          padding: "0.85rem 1rem",
          fontSize: "0.84rem",
          color: "#166534",
          lineHeight: 1.55,
        }}
      >
        <strong>📸 정확한 AI 분석을 위한 촬영 팁:</strong> 밝은 실내 조명 아래에서 초점을 맞추어 병변 중심부가 화면에 잘 드러나도록 촬영해 주세요. 약봉투나 처방전이 있다면 좌측의 <strong>[📄 약봉투/처방전 OCR 자동입력]</strong> 버튼으로 약품명을 바로 불러올 수 있습니다.
      </div>
    </div>
  );
}