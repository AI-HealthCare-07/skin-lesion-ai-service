import { useState, useRef, useEffect } from "react";
import "./App.css";

const API_BASE = "http://127.0.0.1:8000"; // FastAPI 백엔드 서버 주소

export default function App() {
  // URL 파라미터(?share=TOKEN) 확인 -> 보호자 큰 글씨 전용 뷰 모드
  const shareTokenFromUrl = new URLSearchParams(window.location.search).get("share");
  const [sharedData, setSharedData] = useState(null);
  const [shareError, setShareError] = useState(null);

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
      loadSchedules();
    }

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [shareTokenFromUrl]);

  const loadSchedules = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/schedules?user_id=1`);
      if (res.ok) setSchedules(await res.json());
    } catch (err) {
      console.error("Schedule load error:", err);
    }
  };

  const handleAddSchedule = async (e) => {
    e.preventDefault();
    const res = await fetch(`${API_BASE}/api/v1/schedules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: 1,
        drug_name: schedDrug,
        dosage_note: schedNote,
        alarm_time: schedTime,
      }),
    });
    if (res.ok) {
      await loadSchedules();
    }
  };

  const handleToggleSchedule = async (scheduleId) => {
    const res = await fetch(`${API_BASE}/api/v1/schedules/${scheduleId}/toggle`, {
      method: "PATCH",
    });
    if (res.ok) {
      await loadSchedules();
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
    formData.append("user_id", 1);
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
          <span className="version-badge">React v1.1 Full</span>
        </div>
      </header>

      <main className="main-container">
        {/* 좌측: 문진 업로드 + 복약·연고 도포 알림 스케줄러 */}
        <div>
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
            <div className="card">
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
                분석이 완료되면 보호자용 큰 글씨 공유 링크 발급과 복약 알림 스케줄 등록까지 한 번에 이용할 수 있습니다.
              </p>
            </div>
          )}

          {report && (
            <>
              {/* 보호자·가족용 큰 글씨 공유 링크 발급 바 */}
              <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                <div>
                  <strong>👨‍👩‍👧 보호자·가족에게 큰 글씨 안내서 공유</strong>
                  <div className="form-hint" style={{ margin: 0 }}>
                    어르신이나 가족이 보기 편한 큰 글씨 요약 링크(24시간 유효)를 발급합니다.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCreateShareLink}
                  style={{
                    border: "none",
                    borderRadius: "10px",
                    padding: "0.6rem 1rem",
                    background: "#1e293b",
                    color: "#fff",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  🔗 공유 링크 발급
                </button>
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
                    <div style={{ marginTop: "0.6rem" }}>
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
    </div>
  );
}