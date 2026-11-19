import { useState } from "react";

const API_BASE = "http://127.0.0.1:8000";

const QUICK_QUESTIONS = [
  "이 연고 바르고 선크림·보습제 발라도 되나요?",
  "스테로이드 연고 중단 시점은 언제가 좋나요?",
  "너무 가려울 때 냉찜질 해도 괜찮을까요?",
];

export default function ReportChatBox({ report, bodyPart }) {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: `안녕하세요! 방금 분석된 '${report.screening.primary_disease_name}' 리포트와 DUR 안전 정보를 바탕으로 궁금한 점을 답변해 드릴게요.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const sendQuestion = async (questionText) => {
    const trimmed = questionText.trim();
    if (!trimmed || loading) return;

    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/v1/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          primary_disease_name: report.screening.primary_disease_name,
          body_part: bodyPart,
          medications: report.guide.medication_guide.map((m) => m.drug_name),
          dur_warnings: (report.guide.dur_warnings || []).map((w) => w.message),
        }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: data.answer || "답변을 생성하지 못했습니다." },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "서버 통신 오류가 발생했습니다: " + err.message },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card no-print" style={{ borderLeft: "5px solid #0d6efd" }}>
      <h2 className="card-title">💬 리포트 연동 AI 복약 · 생활 Q&A 상담</h2>
      <div className="form-hint" style={{ marginBottom: "0.75rem" }}>
        현재 진단 결과({report.screening.primary_disease_name})와 처방약 DUR 데이터를 기반으로 추가 질문을 할 수 있습니다.
      </div>

      {/* 빠른 질문 추천 버튼 */}
      <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap", marginBottom: "0.85rem" }}>
        {QUICK_QUESTIONS.map((q, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => sendQuestion(q)}
            style={{
              border: "1px solid #bfdbfe",
              background: "#eff6ff",
              color: "#1d4ed8",
              borderRadius: "999px",
              padding: "0.32rem 0.75rem",
              fontSize: "0.8rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            + {q}
          </button>
        ))}
      </div>

      {/* 대화 내역 창 */}
      <div
        style={{
          maxHeight: "230px",
          overflowY: "auto",
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: "10px",
          padding: "0.85rem",
          display: "grid",
          gap: "0.6rem",
          marginBottom: "0.75rem",
        }}
      >
        {messages.map((m, idx) => (
          <div
            key={idx}
            style={{
              justifySelf: m.role === "user" ? "end" : "start",
              maxWidth: "85%",
              background: m.role === "user" ? "#0d6efd" : "#ffffff",
              color: m.role === "user" ? "#ffffff" : "#1e293b",
              border: m.role === "user" ? "none" : "1px solid #cbd5e1",
              borderRadius: "12px",
              padding: "0.55rem 0.85rem",
              fontSize: "0.88rem",
              lineHeight: 1.5,
            }}
          >
            {m.text}
          </div>
        ))}
        {loading && <div style={{ fontSize: "0.82rem", color: "#64748b" }}>⏳ 리포트 문맥 분석 중...</div>}
      </div>

      {/* 질문 입력 폼 */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendQuestion(input);
        }}
        style={{ display: "flex", gap: "0.5rem" }}
      >
        <input
          type="text"
          className="form-control"
          placeholder="복약 순서, 연고 사용법, 생활 주의사항을 질문하세요..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            border: "none",
            borderRadius: "10px",
            padding: "0 1.1rem",
            background: "#0d6efd",
            color: "#fff",
            fontWeight: 700,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          질문하기
        </button>
      </form>
    </div>
  );
}