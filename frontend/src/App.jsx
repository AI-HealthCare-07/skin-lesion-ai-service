import { useState, useRef, useEffect } from "react";
import "./App.css";

const API_BASE = "http://127.0.0.1:8000"; // FastAPI 백엔드 서버 주소

export default function App() {
  // URL 파라미터(?share=TOKEN) 확인 -> 보호자 큰 글씨 전용 뷰 모드
  const shareTokenFromUrl = new URLSearchParams(window.location.search).get("share");
  const [sharedData, setSharedData] = useState(null);
  const [shareError, setShareError] = useState(null);

  // JWT 사용자 인증 및 화면 탭 상태
  const [currentUser, setCurrentUser] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState("login"); // "login" | "register"
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authPregnant, setAuthPregnant] = useState(false);
  const [activeTab, setActiveTab] = useState("analyze"); // "analyze" | "history"
  const [historyList, setHistoryList] = useState([]);

  const activeUserId = currentUser ? currentUser.user_id : 1;

  // 문진 폼 상태
  const [bodyPart, setBodyPart] = useState("FACE");
  const [symptoms, setSymptoms] = useState("홍반, 각질, 가려움");
  const [itchScore, setItchScore] = useState(6);
  const [painScore, setPainScore] = useState(2);
  const [medications, setMedications] = useState("더모베이트연고0.05%, 에바스텔정10mg");
  const [userMemo, setUserMemo] = useState("볼 주변이 붉어지고 각질이 일어나며 가렵습니다.");
  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  // 비동기 진행 및 리포트 상태
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState(null);
  const [taskStatus, setTaskStatus] = useState(null);
  const [report, setReport] = useState(null);
  const [heatmapOpacity, setHeatmapOpacity] = useState(65);
  const [shareLinkInfo, setShareLinkInfo] = useState(null);

  // 복약·연고 도포 알림 스케줄러 상태
  const [schedules, setSchedules] = useState([]);
  const [schedDrug, setSchedDrug] = useState("리도멕스크림0.15%");
  const [schedNote, setSchedNote] = useState("보습제 15분 후 환부에 2.5 FTU 도포");
  const [schedTime, setSchedTime] = useState("21:00");

  const pollTimerRef = useRef(null);

  // 초기 로드 시 저장된 JWT 토큰 확인
  useEffect(() => {
    const savedToken = localStorage.getItem("mediguide_token");
    if (savedToken) {
      fetch(`${API_BASE}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${savedToken}` },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((userData) => {
          if (userData) setCurrentUser(userData);
          else localStorage.removeItem("mediguide_token");
        })
        .catch(() => localStorage.removeItem("mediguide_token"));
    }
  }, []);

  useEffect(() => {
    if (shareTokenFromUrl) {
      fetch(`${API_BASE}/api/v1/share/${shareTokenFromUrl}`)
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.detail || "공유 리포트 로드 실패");
          setSharedData(data);
        })
        .catch((err) => setShareError(err.message));
    } else {
      loadSchedules(activeUserId);
      loadHistory(activeUserId);
    }

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [shareTokenFromUrl, activeUserId]);

  const loadSchedules = async (uid = activeUserId) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/schedules?user_id=${uid}`);
      if (res.ok) setSchedules(await res.json());
    } catch (err) {
      console.error("Schedule load error:", err);
    }
  };

  const loadHistory = async (uid = activeUserId) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/history?user_id=${uid}`);
      if (res.ok) setHistoryList(await res.json());
    } catch (err) {
      console.error("History load error:", err);
    }
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    const endpoint = authMode === "login" ? "/api/v1/auth/login" : "/api/v1/auth/register";
    const body =
      authMode === "login"
        ? { email: authEmail, password: authPassword }
        : {
            email: authEmail,
            password: authPassword,
            name: authName,
            is_pregnant_or_nursing: authPregnant,
          };

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "인증에 실패했습니다.");

      localStorage.setItem("mediguide_token", data.access_token);
      setCurrentUser(data.user);
      setShowAuthModal(false);
      setAuthEmail("");
      setAuthPassword("");
      setAuthName("");
    } catch (err) {
      alert(err.message);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("mediguide_token");
    setCurrentUser(null);
    setReport(null);
    setTaskStatus(null);
  };

  const handleSelectHistoryItem = async (item) => {
    if (!item.task_id) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/reports/${item.task_id}`);
      if (!res.ok) {
        alert("아직 분석이 완료되지 않은 기록입니다.");
        return;
      }
      const repData = await res.json();
      setCurrentTaskId(item.task_id);
      setReport(repData);
      setShareLinkInfo(null);
      setTaskStatus({
        status: "COMPLETED",
        progress_percent: 100,
        message: `[${item.created_at}] 과거 진단 리포트를 불러왔습니다.`,
      });
      setActiveTab("analyze");
    } catch (err) {
      alert("과거 리포트 조회 오류: " + err.message);
    }
  };

  const handleAddSchedule = async (e) => {
    e.preventDefault();
    const res = await fetch(`${API_BASE}/api/v1/schedules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: activeUserId,
        drug_name: schedDrug,
        dosage_note: schedNote,
        alarm_time: schedTime,
      }),
    });
    if (res.ok) {
      await loadSchedules(activeUserId);
    }
  };

  const handleToggleSchedule = async (scheduleId) => {
    const res = await fetch(`${API_BASE}/api/v1/schedules/${scheduleId}/toggle`, {
      method: "PATCH",
    });
    if (res.ok) {
      await loadSchedules(activeUserId);
    }
  };

  const handleCreateShareLink = async () => {
    if (!currentTaskId) return;
    const res = await fetch(`${API_BASE}/api/v1/share/${currentTaskId}`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setShareLinkInfo(data);
      navigator.clipboard?.writeText(data.share_url);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setImageFile(null);
      setPreviewUrl(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setReport(null);
    setShareLinkInfo(null);
    setTaskStatus({ status: "PENDING", progress_percent: 10, message: "서버에 분석 요청을 전송 중입니다..." });

    const formData = new FormData();
    formData.append("user_id", activeUserId);
    formData.append("body_part", bodyPart);
    formData.append("symptoms", symptoms);
    formData.append("itch_score", itchScore);
    formData.append("pain_score", painScore);
    formData.append("user_memo", userMemo);
    formData.append("current_medications", medications);
    if (imageFile) {
      formData.append("image", imageFile);
    }

    try {
      const res = await fetch(`${API_BASE}/api/v1/records`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "분석 요청 실패");

      setCurrentTaskId(data.task_id);
      startPolling(data.task_id);
    } catch (err) {
      alert("오류 발생: " + err.message);
      setIsSubmitting(false);
    }
  };

  const startPolling = (taskId) => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);

    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/tasks/${taskId}`);
        const statusData = await res.json();
        setTaskStatus(statusData);

        if (statusData.status === "COMPLETED") {
          clearInterval(pollTimerRef.current);
          const repRes = await fetch(`${API_BASE}/api/v1/reports/${taskId}`);
          setReport(await repRes.json());
          setIsSubmitting(false);
          loadHistory(activeUserId);
        } else if (statusData.status === "FAILED") {
          clearInterval(pollTimerRef.current);
          alert("AI 분석 실패: " + statusData.message);
          setIsSubmitting(false);
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 1000);
  };

  const resolveImageUrl = (rawPath) => {
    if (!rawPath) return "";
    return `${API_BASE}/${rawPath.replace(/\\/g, "/")}`;
  };

  // [보호자·가족 전용 큰 글씨 요약 뷰]
  if (shareTokenFromUrl) {
    return (
      <div style={{ maxWidth: "780px", margin: "2rem auto", padding: "0 1.25rem", fontSize: "1.2rem", lineHeight: 1.7 }}>
        <div className="card" style={{ borderTop: "8px solid #0d6efd", padding: "2rem" }}>
          <h1 style={{ fontSize: "1.8rem", marginTop: 0, color: "#0a4296" }}>
            👨‍👩‍👧 가족·보호자용 큰 글씨 복약 안내서
          </h1>
          {shareError ? (
            <div className="alert-danger" style={{ fontSize: "1.15rem" }}>⚠️ {shareError}</div>
          ) : !sharedData ? (
            <p>안내서를 불러오는 중입니다...</p>
          ) : (
            <>
              <div style={{ background: "#f1f5f9", padding: "1.25rem", borderRadius: "12px", marginBottom: "1.25rem" }}>
                <div style={{ fontSize: "1rem", color: "#475569" }}>예상 피부 소견</div>
                <strong style={{ fontSize: "1.6rem", color: "#0d6efd" }}>{sharedData.primary_disease_name}</strong>
                <p style={{ margin: "0.5rem 0 0 0" }}>{sharedData.visual_finding_summary}</p>
              </div>

              {sharedData.dur_warnings?.map((w, idx) => (
                <div key={idx} className="alert-danger" style={{ fontSize: "1.18rem" }}>
                  <strong>🚨 꼭 주의하세요 ({w.drug_name})</strong>
                  <div>{w.message}</div>
                </div>
              ))}

              <div className="ftu-box" style={{ fontSize: "1.18rem" }}>
                <strong>📏 연고 바르는 양 ({sharedData.ftu_dosage_guide?.body_part_label})</strong>
                <div>{sharedData.ftu_dosage_guide?.instruction}</div>
              </div>

              <h3 style={{ fontSize: "1.35rem" }}>💊 처방 의약품 주의사항</h3>
              {sharedData.medication_guide?.map((m, idx) => (
                <div key={idx} className="med-item" style={{ fontSize: "1.12rem" }}>
                  <strong>{m.drug_name}</strong>
                  <p style={{ margin: "0.4rem 0 0 0" }}>{m.guidance_summary}</p>
                </div>
              ))}

              <a href="/" className="btn-submit" style={{ display: "block", textAlign: "center", textDecoration: "none", marginTop: "1.5rem" }}>
                ← 일반 서비스 화면으로 돌아가기
              </a>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <header className="app-header">
        <div className="header-inner">
          <div>
            <h1 className="header-title">🩺 MediGuide AI</h1>
            <p className="header-sub">
              설명 가능한(XAI) 피부 병변 스크리닝 & 식약처 DUR 기반 맞춤형 복약 가이드
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setActiveTab("analyze")}
              style={{
                border: "none",
                borderRadius: "999px",
                padding: "0.4rem 0.95rem",
                fontWeight: 700,
                cursor: "pointer",
                background: activeTab === "analyze" ? "#ffffff" : "rgba(255,255,255,0.18)",
                color: activeTab === "analyze" ? "#0a4296" : "#ffffff",
              }}
            >
              🔬 신규 AI 분석
            </button>
            <button
              type="button"
              onClick={() => {
                loadHistory(activeUserId);
                setActiveTab("history");
              }}
              style={{
                border: "none",
                borderRadius: "999px",
                padding: "0.4rem 0.95rem",
                fontWeight: 700,
                cursor: "pointer",
                background: activeTab === "history" ? "#ffffff" : "rgba(255,255,255,0.18)",
                color: activeTab === "history" ? "#0a4296" : "#ffffff",
              }}
            >
              📜 내 진단 히스토리 ({historyList.length})
            </button>

            {currentUser ? (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span className="version-badge">👤 {currentUser.name}님</span>
                <button
                  type="button"
                  onClick={handleLogout}
                  style={{
                    border: "1px solid rgba(255,255,255,0.45)",
                    borderRadius: "999px",
                    padding: "0.35rem 0.8rem",
                    background: "transparent",
                    color: "#fff",
                    cursor: "pointer",
                    fontSize: "0.8rem",
                  }}
                >
                  로그아웃
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setAuthMode("login");
                  setShowAuthModal(true);
                }}
                className="version-badge"
                style={{ cursor: "pointer", border: "none" }}
              >
                🔐 로그인 / 회원가입
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 로그인 / 회원가입 모달 */}
      {showAuthModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "1rem",
          }}
        >
          <div className="card" style={{ width: "100%", maxWidth: "420px", margin: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h2 className="card-title" style={{ margin: 0 }}>
                {authMode === "login" ? "🔐 MediGuide AI 로그인" : "📝 새 계정 회원가입"}
              </h2>
              <button
                type="button"
                onClick={() => setShowAuthModal(false)}
                style={{ border: "none", background: "transparent", fontSize: "1.2rem", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAuthSubmit}>
              {authMode === "register" && (
                <div className="form-group">
                  <label className="form-label">이름 (닉네임)</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="홍길동"
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    required
                  />
                </div>
              )}
              <div className="form-group">
                <label className="form-label">이메일</label>
                <input
                  type="email"
                  className="form-control"
                  placeholder="user@example.com"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">비밀번호</label>
                <input
                  type="password"
                  className="form-control"
                  placeholder="••••••••"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  required
                />
              </div>
              {authMode === "register" && (
                <div className="form-group">
                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.88rem", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={authPregnant}
                      onChange={(e) => setAuthPregnant(e.target.checked)}
                    />
                    임신부 또는 수유부입니다 (DUR 안전 경고 강화)
                  </label>
                </div>
              )}
              <button type="submit" className="btn-submit">
                {authMode === "login" ? "로그인하기" : "가입 완료 및 시작하기"}
              </button>
            </form>

            <div style={{ textAlign: "center", marginTop: "0.9rem", fontSize: "0.85rem" }}>
              {authMode === "login" ? (
                <>
                  아직 계정이 없으신가요?{" "}
                  <button
                    type="button"
                    onClick={() => setAuthMode("register")}
                    style={{ border: "none", background: "none", color: "#0d6efd", fontWeight: 700, cursor: "pointer" }}
                  >
                    회원가입
                  </button>
                </>
              ) : (
                <>
                  이미 계정이 있으신가요?{" "}
                  <button
                    type="button"
                    onClick={() => setAuthMode("login")}
                    style={{ border: "none", background: "none", color: "#0d6efd", fontWeight: 700, cursor: "pointer" }}
                  >
                    로그인
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 탭 2: 과거 진단 히스토리(경과 추적) 화면 */}
      {activeTab === "history" ? (
        <div style={{ maxWidth: "1020px", margin: "1.5rem auto", padding: "0 1.25rem" }}>
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <div>
                <h2 className="card-title" style={{ margin: 0 }}>
                  📜 {currentUser ? `${currentUser.name}님의` : "게스트"} 피부 진단 및 경과 추적 히스토리
                </h2>
                <div className="form-hint" style={{ margin: "0.3rem 0 0 0" }}>
                  과거 분석 카드를 클릭하면 당시의 Grad-CAM 히트맵과 복약 가이드를 다시 확인할 수 있습니다.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("analyze")}
                className="btn-submit"
                style={{ width: "auto", padding: "0.55rem 1rem" }}
              >
                + 새 병변 분석하기
              </button>
            </div>

            {historyList.length === 0 ? (
              <div className="empty-state">
                <h3>아직 저장된 진단 기록이 없습니다</h3>
                <p>첫 번째 피부 병변 사진을 업로드하여 분석을 시작해 보세요.</p>
              </div>
            ) : (
              <div style={{ display: "grid", gap: "0.85rem" }}>
                {historyList.map((item) => (
                  <div
                    key={item.record_id}
                    onClick={() => handleSelectHistoryItem(item)}
                    className="med-item"
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "1rem",
                      cursor: "pointer",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                      {item.gradcam_image_url ? (
                        <img
                          src={resolveImageUrl(item.gradcam_image_url)}
                          alt="히트맵 썸네일"
                          style={{ width: "68px", height: "68px", borderRadius: "10px", objectFit: "cover", border: "1px solid #cbd5e1" }}
                        />
                      ) : (
                        <div
                          style={{
                            width: "68px",
                            height: "68px",
                            borderRadius: "10px",
                            background: "#e2e8f0",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "0.75rem",
                            color: "#64748b",
                          }}
                        >
                          이미지 없음
                        </div>
                      )}
                      <div>
                        <div style={{ fontSize: "0.82rem", color: "#64748b" }}>
                          🕒 {item.created_at} · 부위: <strong>{item.body_part}</strong>
                        </div>
                        <strong style={{ fontSize: "1.08rem", color: "#0d6efd" }}>
                          {item.primary_disease_name} ({(item.confidence_score * 100).toFixed(1)}%)
                        </strong>
                        <div style={{ fontSize: "0.85rem", color: "#334155", marginTop: "0.2rem" }}>
                          가려움: <strong>{item.itch_score}/10</strong> · 통증: <strong>{item.pain_score}/10</strong> · 증상:{" "}
                          {item.symptoms.join(", ")}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                      <span className="status-pill">{item.risk_level}</span>
                      <span style={{ color: "#0d6efd", fontWeight: 700, fontSize: "0.88rem" }}>리포트 보기 →</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <main className="main-container">
          {/* 좌측: 문진 업로드 + 복약·연고 도포 알림 스케줄러 (인쇄 시 자동 숨김) */}
          <div className="no-print">
            <section className="card">
              <h2 className="card-title">1. 피부 병변 문진 및 사진 업로드</h2>
              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label className="form-label">병변 발생 부위</label>
                  <select className="form-control" value={bodyPart} onChange={(e) => setBodyPart(e.target.value)}>
                    <option value="FACE">얼굴 (FACE) - 민감 부위</option>
                    <option value="NECK">목 (NECK)</option>
                    <option value="ARM">팔 (ARM)</option>
                    <option value="HANDS_FEET">손 / 발 (HANDS_FEET)</option>
                    <option value="TRUNK">몸통 (TRUNK)</option>
                    <option value="LEG">다리 (LEG)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">주요 자각 증상 (쉼표 구분)</label>
                  <input type="text" className="form-control" value={symptoms} onChange={(e) => setSymptoms(e.target.value)} required />
                </div>

                <div className="form-group slider-row">
                  <div>
                    <label className="form-label">가려움 지수: {itchScore}/10</label>
                    <input type="range" min="0" max="10" value={itchScore} onChange={(e) => setItchScore(Number(e.target.value))} style={{ width: "100%" }} />
                  </div>
                  <div>
                    <label className="form-label">통증 지수: {painScore}/10</label>
                    <input type="range" min="0" max="10" value={painScore} onChange={(e) => setPainScore(Number(e.target.value))} style={{ width: "100%" }} />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">처방/보유 의약품 (DUR 검증용)</label>
                  <input type="text" className="form-control" value={medications} onChange={(e) => setMedications(e.target.value)} />
                </div>

                <div className="form-group">
                  <label className="form-label">증상 상세 메모</label>
                  <textarea className="form-control" rows="2" value={userMemo} onChange={(e) => setUserMemo(e.target.value)} />
                </div>

                <div className="form-group">
                  <label className="form-label">실제 병변 사진 파일 첨부</label>
                  <input type="file" className="form-control" accept="image/*" onChange={handleFileChange} />
                  {previewUrl && (
                    <div className="preview-box">
                      <img src={previewUrl} alt="업로드 미리보기" />
                    </div>
                  )}
                </div>

                <button type="submit" className="btn-submit" disabled={isSubmitting}>
                  {isSubmitting ? "⏳ AI 파이프라인 분석 진행 중..." : "🔍 AI 스크리닝 및 복약 가이드 분석 시작"}
                </button>
              </form>
            </section>

            {/* 복약·연고 도포 알림 스케줄러 카드 */}
            <section className="card">
              <h2 className="card-title">⏰ 복약 · 연고 도포 알림 스케줄러</h2>
              <form onSubmit={handleAddSchedule} style={{ display: "grid", gap: "0.6rem", marginBottom: "1rem" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 110px", gap: "0.5rem" }}>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="의약품명"
                    value={schedDrug}
                    onChange={(e) => setSchedDrug(e.target.value)}
                    required
                  />
                  <input
                    type="time"
                    className="form-control"
                    value={schedTime}
                    onChange={(e) => setSchedTime(e.target.value)}
                    required
                  />
                </div>
                <input
                  type="text"
                  className="form-control"
                  placeholder="도포/복용 메모 (예: 보습제 15분 후 얇게 도포)"
                  value={schedNote}
                  onChange={(e) => setSchedNote(e.target.value)}
                />
                <button type="submit" className="btn-submit" style={{ background: "#0f766e", padding: "0.6rem" }}>
                  + 알림 스케줄 추가
                </button>
              </form>

              {schedules.length === 0 ? (
                <div className="form-hint">등록된 복약 알림이 없습니다.</div>
              ) : (
                schedules.map((s) => (
                  <div
                    key={s.schedule_id}
                    className="med-item"
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", opacity: s.is_active ? 1 : 0.55 }}
                  >
                    <div>
                      <strong style={{ color: "#0d6efd" }}>{s.alarm_time}</strong> · <strong>{s.drug_name}</strong>
                      <div className="form-hint" style={{ margin: 0 }}>{s.dosage_note}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleSchedule(s.schedule_id)}
                      style={{
                        border: "none",
                        borderRadius: "8px",
                        padding: "0.35rem 0.65rem",
                        cursor: "pointer",
                        fontWeight: 700,
                        background: s.is_active ? "#dcfce7" : "#e2e8f0",
                        color: s.is_active ? "#166534" : "#475569",
                      }}
                    >
                      {s.is_active ? "ON" : "OFF"}
                    </button>
                  </div>
                ))
              )}
            </section>
          </div>

          {/* 우측: 진행 상태 및 통합 분석 리포트 */}
          <section>
            {taskStatus && (
              <div className="card no-print">
                <div className="progress-header">
                  <strong>🔬 AI 비동기 분석 파이프라인</strong>
                  <span className="status-pill">{taskStatus.status}</span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${taskStatus.progress_percent}%` }}>
                    {taskStatus.progress_percent}%
                  </div>
                </div>
                <div className="form-hint">{taskStatus.message}</div>
              </div>
            )}

            {!taskStatus && !report && (
              <div className="card empty-state">
                <h3>병변 사진을 업로드하고 분석을 시작하세요</h3>
                <p>
                  분석이 완료되면 진료용 PDF 출력, 주변 피부과·약국 안내, 보호자용 큰 글씨 공유 링크까지 한 번에 이용할 수 있습니다.
                </p>
              </div>
            )}

            {report && (
              <>
                {/* 인쇄 / PDF 저장 시에만 표시되는 진료 참고용 요약 헤더 */}
                <div className="print-only-header">
                  <h2 style={{ margin: 0, color: "#0a4296" }}>🩺 MediGuide AI - 피부과 진료 참고용 요약 리포트</h2>
                  <div style={{ fontSize: "0.9rem", color: "#334155", marginTop: "0.35rem" }}>
                    환자명: <strong>{currentUser ? currentUser.name : "게스트"}</strong> · 출력일시:{" "}
                    <strong>{new Date().toLocaleString("ko-KR")}</strong> · 발생부위: <strong>{bodyPart}</strong> ·
                    가려움: <strong>{itchScore}/10</strong> · 통증: <strong>{painScore}/10</strong>
                  </div>
                </div>

                {/* 진료용 PDF 출력 · 주변 피부과/약국 · 보호자 공유 링크 바 */}
                <div className="card no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                  <div>
                    <strong>🏥 진료 준비 및 가족 공유 도구</strong>
                    <div className="form-hint" style={{ margin: 0 }}>
                      병원 진료 시 PDF로 출력해 보여주거나, 주변 피부과·약국 및 가족 공유 링크를 이용하세요.
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => window.print()}
                      style={{
                        border: "none",
                        borderRadius: "10px",
                        padding: "0.6rem 0.95rem",
                        background: "#0d6efd",
                        color: "#fff",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      🖨️ 진료용 PDF / 인쇄
                    </button>
                    <a
                      href="https://map.naver.com/p/search/피부과"
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        borderRadius: "10px",
                        padding: "0.6rem 0.95rem",
                        background: "#0f766e",
                        color: "#fff",
                        fontWeight: 700,
                        textDecoration: "none",
                        fontSize: "0.86rem",
                        display: "inline-flex",
                        alignItems: "center",
                      }}
                    >
                      🏥 주변 피부과
                    </a>
                    <a
                      href="https://map.naver.com/p/search/약국"
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        borderRadius: "10px",
                        padding: "0.6rem 0.95rem",
                        background: "#0369a1",
                        color: "#fff",
                        fontWeight: 700,
                        textDecoration: "none",
                        fontSize: "0.86rem",
                        display: "inline-flex",
                        alignItems: "center",
                      }}
                    >
                      💊 주변 약국
                    </a>
                    <button
                      type="button"
                      onClick={handleCreateShareLink}
                      style={{
                        border: "none",
                        borderRadius: "10px",
                        padding: "0.6rem 0.95rem",
                        background: "#1e293b",
                        color: "#fff",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      🔗 가족 공유 링크
                    </button>
                  </div>
                  {shareLinkInfo && (
                    <div style={{ width: "100%", background: "#f1f5f9", padding: "0.65rem 0.9rem", borderRadius: "8px", fontSize: "0.85rem" }}>
                      ✅ 클립보드에 복사되었습니다! 바로 열어보기:{" "}
                      <a href={shareLinkInfo.share_url} target="_blank" rel="noreferrer" style={{ fontWeight: 700, color: "#0d6efd" }}>
                        {shareLinkInfo.share_url}
                      </a>
                    </div>
                  )}
                </div>

                {/* DUR 경고 */}
                {report.guide.dur_warnings?.length > 0 ? (
                  report.guide.dur_warnings.map((w, idx) => (
                    <div key={idx} className="alert-danger">
                      <strong>🚨 [DUR 안전 경고 - {w.drug_name}]</strong>
                      <div>{w.message}</div>
                    </div>
                  ))
                ) : (
                  <div className="alert-success">
                    ✅ 입력된 부위 및 처방약에서 특이 DUR 금기 사항이 발견되지 않았습니다.
                  </div>
                )}

                {/* XAI Grad-CAM 시각화 */}
                <div className="card">
                  <div className="progress-header">
                    <h2 className="card-title" style={{ margin: 0 }}>2. AI 병변 스크리닝 & Grad-CAM 히트맵</h2>
                    <span className="status-pill">{report.screening.risk_level}</span>
                  </div>

                  <div className="xai-grid" style={{ marginTop: "1rem" }}>
                    <div style={{ textAlign: "center" }}>
                      <div className="xai-viewer">
                        <img src={resolveImageUrl(report.screening.original_image_url)} alt="원본 병변" />
                        <img
                          src={resolveImageUrl(report.screening.gradcam_image_url)}
                          alt="Grad-CAM 히트맵"
                          style={{ opacity: heatmapOpacity / 100 }}
                        />
                      </div>
                      <div className="no-print" style={{ marginTop: "0.6rem" }}>
                        <label className="form-label">히트맵 투명도 조절: {heatmapOpacity}%</label>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={heatmapOpacity}
                          onChange={(e) => setHeatmapOpacity(Number(e.target.value))}
                          style={{ width: "90%" }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="disease-highlight">
                        <div className="form-hint">1순위 예측 질환</div>
                        <h3 className="disease-name">
                          {report.screening.primary_disease_name} ({(report.screening.confidence_score * 100).toFixed(1)}%)
                        </h3>
                        <div style={{ fontSize: "0.86rem", color: "#475569" }}>
                          {report.screening.visual_finding_summary}
                        </div>
                      </div>

                      <div className="form-label">후보 질환 확률 분포 (Top-3)</div>
                      {report.screening.top3_candidates.map((c, idx) => (
                        <div key={idx} className="top3-item">
                          <div className="top3-label">
                            <span>{c.disease_name}</span>
                            <strong>{(c.probability * 100).toFixed(1)}%</strong>
                          </div>
                          <div className="mini-track">
                            <div className="mini-fill" style={{ width: `${c.probability * 100}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* FTU 및 복약 가이드 */}
                <div className="card">
                  <h2 className="card-title">3. 맞춤형 FTU 정량 도포 및 복약 가이드</h2>
                  <div className="ftu-box">
                    <strong>
                      📏 권장 도포량 ({report.guide.ftu_dosage_guide.body_part_label}):{" "}
                      {report.guide.ftu_dosage_guide.recommended_ftu} FTU ({report.guide.ftu_dosage_guide.recommended_grams}g)
                    </strong>
                    <div>{report.guide.ftu_dosage_guide.instruction}</div>
                  </div>

                  {report.guide.medication_guide.map((m, idx) => (
                    <div key={idx} className="med-item">
                      <strong>💊 {m.drug_name} ({m.ingredient})</strong>
                      <p style={{ margin: "0.35rem 0 0 0", fontSize: "0.86rem", color: "#475569" }}>{m.guidance_summary}</p>
                    </div>
                  ))}

                  <div className="two-col-grid">
                    <div className="sub-box">
                      <strong style={{ color: "#15803d" }}>🌿 생활 습관 관리</strong>
                      <ul style={{ paddingLeft: "1.2rem", margin: "0.5rem 0 0 0" }}>
                        {report.guide.lifestyle_guide.map((l, idx) => (
                          <li key={idx}>{l}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="sub-box">
                      <strong style={{ color: "#1d4ed8" }}>💬 다음 진료 시 의사 질문 3선</strong>
                      <ol style={{ paddingLeft: "1.2rem", margin: "0.5rem 0 0 0" }}>
                        {report.guide.doctor_questions.map((q, idx) => (
                          <li key={idx}>{q}</li>
                        ))}
                      </ol>
                    </div>
                  </div>

                  <hr style={{ margin: "1.2rem 0", borderColor: "#e2e8f0" }} />
                  <div className="form-hint">
                    <strong>📚 RAG 인용 근거 출처:</strong>
                    <ul style={{ paddingLeft: "1.2rem", margin: "0.4rem 0 0 0" }}>
                      {report.guide.retrieved_sources.map((s, idx) => (
                        <li key={idx}>
                          [{s.doc_id}] {s.organization} - {s.title} (유사도: {s.similarity_score})
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="disclaimer-bar">※ {report.disclaimer}</div>
              </>
            )}
          </section>
        </main>
      )}
    </div>
  );
}