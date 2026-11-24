import { useState, useRef, useEffect } from "react";
import "./App.css";
import { speakKoreanText, triggerMedicationAlert } from "./alertHelper";
import ReportChatBox from "./ReportChatBox";
import EmergencyTriageBanner from "./EmergencyTriageBanner";
import PersonalDurBanner from "./PersonalDurBanner";
import MainWelcomePanel from "./MainWelcomePanel";
import AppFooter from "./AppFooter";

const API_BASE = "http://127.0.0.1:8000";

function parseMedicationSummary(rawText = "") {
  let gradeBadge = "";
  let body = rawText.trim();

  const headerMatch = body.match(/^\[([^\]]+)\]\s*/);
  if (headerMatch) {
    const parts = headerMatch[1].split("|").map((p) => p.trim());
    if (parts.length >= 3) {
      gradeBadge = parts[2];
    }
    body = body.slice(headerMatch[0].length).trim();
  }

  const sectionRegex = /(효능·효과:|효능:|용법·용량:|용법:|사용상 주의사항 및 DUR 부위 금기:|사용상 주의사항:|주의사항:)/g;
  const formattedBody = body.replace(sectionRegex, "\n$1").trim();
  const lines = formattedBody
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return { gradeBadge, lines };
}

// 스테로이드 강도 등급(1~7등급) 시각적 게이지 데이터 추출기
function getSteroidPotencyMeta(drugName = "", gradeBadge = "", guidanceSummary = "") {
  const combined = `${drugName} ${gradeBadge} ${guidanceSummary}`;
  const isSteroid =
    combined.includes("스테로이드") ||
    /더모베이트|클로베타솔|베타메타손|모메타손|리도멕스|프레드니솔론|데소나|데소나이드|락티케어|하이드로코르티손/i.test(drugName);

  if (!isSteroid) return null;

  let level = 5; // 기본값: 약함~중등도
  let label = "5등급 · 약한 강도";
  let guideText = "얼굴·접히는 부위 단기 사용 가능 · 최대 2~3주 이내 권장";

  if (/1등급|초강력|더모베이트|클로베타솔/.test(combined)) {
    level = 1;
    label = "1등급 · 초강력";
    guideText = "최대 1~2주 이내 단기 사용 · 얼굴·사타구니 등 얇은 피부 도포 금지";
  } else if (/2등급|강력/.test(combined) && !/초강력/.test(combined)) {
    level = 2;
    label = "2등급 · 강력";
    guideText = "최대 2주 이내 사용 · 손·발바닥·두꺼운 병변 위주 도포 권장";
  } else if (/3등급|중상/.test(combined) || /모메타손|베타메타손/.test(combined)) {
    level = 3;
    label = "3등급 · 중상 강도";
    guideText = "최대 2~3주 이내 · 민감 부위 장기 연속 도포 주의";
  } else if (/4등급|중등도/.test(combined)) {
    level = 4;
    label = "4등급 · 중등도";
    guideText = "증상 호전 시 감량(테이퍼링) · 최대 3주 이내 사용 권장";
  } else if (/5등급|약함|리도멕스|프레드니솔론/.test(combined)) {
    level = 5;
    label = "5등급 · 약함";
    guideText = "얼굴·목 등 민감 부위 적용 가능 · 호전 시 보습제로 전환";
  } else if (/6등급|데소나|데소나이드/.test(combined)) {
    level = 6;
    label = "6등급 · 매우 약함";
    guideText = "소아·민감 피부 비교적 안전 · 눈 주위 과다 도포 주의";
  } else if (/7등급|최약|락티케어|하이드로코르티손/.test(combined)) {
    level = 7;
    label = "7등급 · 최약 강도";
    guideText = "가장 순한 등급 · 증상 완화 시 주 2회 유지 또는 보습 관리";
  }

  return { level, label, guideText };
}
// 
export default function App() {
  const shareTokenFromUrl = new URLSearchParams(window.location.search).get("share");
  const [sharedData, setSharedData] = useState(null);
  const [shareError, setShareError] = useState(null);
  const [largeTextMode, setLargeTextMode] = useState(false);

  const toggleLargeTextMode = () => {
    const next = !largeTextMode;
    setLargeTextMode(next);
    document.documentElement.style.fontSize = next ? "18.5px" : "16px";
  };

  // JWT 인증 및 탭 상태
  const [currentUser, setCurrentUser] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authPregnant, setAuthPregnant] = useState(false);
  const [activeTab, setActiveTab] = useState("analyze");
  const [historyList, setHistoryList] = useState([]);

  const activeUserId = currentUser ? currentUser.user_id : 1;

  // 문진 폼, OCR 및 개인 맞춤 DUR 상태
  const [bodyPart, setBodyPart] = useState("FACE");
  const [symptoms, setSymptoms] = useState("홍반, 각질, 가려움");
  const [itchScore, setItchScore] = useState(6);
  const [painScore, setPainScore] = useState(2);
  const [medications, setMedications] = useState("더모베이트연고0.05%, 에바스텔정10mg");
  const [userMemo, setUserMemo] = useState("볼 주변이 붉어지고 각질이 일어나며 가렵습니다.");
  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResultText, setOcrResultText] = useState("");
  const [selectedAllergies, setSelectedAllergies] = useState([]);
  const [selectedConditions, setSelectedConditions] = useState([]);

  // 비동기 진행 및 리포트 상태
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState(null);
  const [taskStatus, setTaskStatus] = useState(null);
  const [report, setReport] = useState(null);
  const [heatmapOpacity, setHeatmapOpacity] = useState(65);
  const [shareLinkInfo, setShareLinkInfo] = useState(null);

  // 복약 스케줄러 & 실시간 푸시·음성 알림 상태
  const [schedules, setSchedules] = useState([]);
  const [schedDrug, setSchedDrug] = useState("리도멕스크림0.15%");
  const [schedNote, setSchedNote] = useState("보습제 15분 후 환부에 2.5 FTU 도포");
  const [schedTime, setSchedTime] = useState("21:00");
  const [alertBanner, setAlertBanner] = useState(null);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [quickAddedDrug, setQuickAddedDrug] = useState("");
  // 사후 관리(Aftercare) 도포·복약 체크리스트 & 경과 메모 상태
  const [aftercareChecks, setAftercareChecks] = useState({
    morningApply: false,
    eveningApply: false,
    moisturizerGap: false,
    itchImproved: false,
  });
  const [aftercareNote, setAftercareNote] = useState("");

  const toggleAftercareCheck = (key) => {
    setAftercareChecks((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const completedCheckCount = Object.values(aftercareChecks).filter(Boolean).length;
  // 

  const pollTimerRef = useRef(null);
  const lastTriggeredRef = useRef("");

  const toggleSelection = (setList, id) => {
    setList((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  // 다빈도 처방약 빠른 추가 칩 로직
  const QUICK_MEDICATION_CHIPS = [
    "더모베이트연고0.05%",
    "리도멕스크림0.15%",
    "에바스텔정10mg",
    "비판텐연고",
  ];

  const handleToggleQuickMedication = (drugName) => {
    const currentList = medications
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    if (currentList.includes(drugName)) {
      setMedications(currentList.filter((item) => item !== drugName).join(", "));
    } else {
      setMedications([...currentList, drugName].join(", "));
    }
  };
  // 
// 다빈도 피부 자각 증상 빠른 선택/해제 로직
  const QUICK_SYMPTOM_CHIPS = [
    "홍반(붉어짐)",
    "각질·인설",
    "심한 가려움",
    "진물·수포",
    "따가움·열감",
  ];

  const handleToggleQuickSymptom = (symptomLabel) => {
    const currentList = symptoms
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    if (currentList.includes(symptomLabel)) {
      setSymptoms(currentList.filter((item) => item !== symptomLabel).join(", "));
    } else {
      setSymptoms([...currentList, symptomLabel].join(", "));
    }
  };
  //

  // 병변 발생 부위별 피부 민감도 · 흡수율 실시간 안내 데이터
  const BODY_PART_SENSITIVITY_INFO = {
    FACE: {
      level: "고위험 민감 부위",
      bg: "#fef2f2",
      border: "#fecaca",
      color: "#b91c1c",
      icon: "⚠️",
      text: "안면부: 피부 각질층이 매우 얇아 약물 흡수율이 높음 (고강도 스테로이드 금기 · 약한 등급 권장)",
    },
    NECK: {
      level: "민감 접힘 부위",
      bg: "#fffbeb",
      border: "#fde68a",
      color: "#b45309",
      icon: "⚡",
      text: "경부(목): 피부가 얇고 마찰이 잦아 자극 및 위축 위험이 높음 (단기·소량 도포 권장)",
    },
    ARM: {
      level: "중등도 · 접힘 주의",
      bg: "#eff6ff",
      border: "#bfdbfe",
      color: "#1d4ed8",
      icon: "ℹ️",
      text: "상지(팔): 일반 부위는 표준 흡수를 보이나, 팔꿈치 안쪽 접히는 부위는 흡수율 증가 주의",
    },
    HANDS_FEET: {
      level: "각질층 두꺼운 부위",
      bg: "#f0fdf4",
      border: "#bbf7d0",
      color: "#15803d",
      icon: "🛡️",
      text: "수족부(손·발): 각질층이 두꺼워 약물 투과율이 낮음 (충분한 보습 후 정량 도포 필요)",
    },
    TRUNK: {
      level: "표준 흡수 부위",
      bg: "#f8fafc",
      border: "#cbd5e1",
      color: "#334155",
      icon: "✅",
      text: "체간(몸통): 표준 약물 흡수율을 보이는 부위 (권장 FTU 정량 기준 준수)",
    },
    LEG: {
      level: "표준 · 건조 주의",
      bg: "#f8fafc",
      border: "#cbd5e1",
      color: "#334155",
      icon: "✅",
      text: "하지(다리): 피부가 건조해지기 쉬운 부위 (세안·샤워 후 3분 이내 보습 병행 권장)",
    },
  };
  //

  const handleApplySampleCase = (sample) => {
    setBodyPart(sample.bodyPart);
    setSymptoms(sample.symptoms);
    setItchScore(sample.itchScore);
    setPainScore(sample.painScore);
    setMedications(sample.medications);
    setUserMemo(sample.userMemo);
    setSelectedAllergies(sample.allergies);
    setSelectedConditions(sample.conditions);
  };

  const [onsetDuration, setOnsetDuration] = useState("1주 이내 (급성 발병 · 연고 미사용)");
  const [showExtraIntake, setShowExtraIntake] = useState(false);
  const [showScheduler, setShowScheduler] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);

  const handleResetPatientForm = () => {
    setBodyPart("FACE");
    setOnsetDuration("1주 이내 (급성 발병 · 연고 미사용)");
    setSymptoms("");
    setItchScore(5);
    setPainScore(0);
    setMedications("");
    setUserMemo("");
    setSelectedAllergies([]);
    setSelectedConditions([]);
    setImageFile(null);
    setPreviewUrl("");
    setOcrResultText("");
    setTaskStatus(null);
    setReport(null);
  };

  // 실시간 복약 스케줄 감시 (15초 주기)
  useEffect(() => {
    if (shareTokenFromUrl) return;
    const timer = setInterval(() => {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      schedules.forEach(async (item) => {
        if (item.is_active && item.alarm_time === hhmm) {
          const key = `${item.schedule_id}_${hhmm}`;
          if (lastTriggeredRef.current !== key) {
            lastTriggeredRef.current = key;
            const info = await triggerMedicationAlert(item.drug_name, item.dosage_note, ttsEnabled);
            setAlertBanner(info);
          }
        }
      });
    }, 15000);
    return () => clearInterval(timer);
  }, [schedules, ttsEnabled, shareTokenFromUrl]);

  // 초기 JWT 토큰 검증
  useEffect(() => {
    const savedToken = localStorage.getItem("mediguide_token");
    if (savedToken) {
      fetch(`${API_BASE}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${savedToken}` },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((userData) => {
          if (userData) {
            setCurrentUser(userData);
            if (userData.is_pregnant_or_nursing) {
              setSelectedConditions((prev) => (prev.includes("PREGNANT") ? prev : [...prev, "PREGNANT"]));
            }
          } else {
            localStorage.removeItem("mediguide_token");
          }
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
      console.error(err);
    }
  };

  const loadHistory = async (uid = activeUserId) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/history?user_id=${uid}`);
      if (res.ok) setHistoryList(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    const handleBeforePrint = () => {
      document.querySelectorAll(".report-bottom-wrap details").forEach((el) => {
        el.setAttribute("open", "true");
      });
    };
    window.addEventListener("beforeprint", handleBeforePrint);
    return () => window.removeEventListener("beforeprint", handleBeforePrint);
  }, []);

  const handlePrescriptionOcr = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrLoading(true);
    setOcrResultText("");
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`${API_BASE}/api/v1/ocr/prescription`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "OCR 인식 실패");
      setMedications(data.formatted_medications);
      setOcrResultText(`인식 완료: ${data.formatted_medications}`);
    } catch (err) {
      alert("처방전 OCR 오류: " + err.message);
    } finally {
      setOcrLoading(false);
    }
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    const endpoint = authMode === "login" ? "/api/v1/auth/login" : "/api/v1/auth/register";
    const body =
      authMode === "login"
        ? { email: authEmail, password: authPassword }
        : { email: authEmail, password: authPassword, name: authName, is_pregnant_or_nursing: authPregnant };
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "인증 실패");
      localStorage.setItem("mediguide_token", data.access_token);
      setCurrentUser(data.user);
      if (data.user?.is_pregnant_or_nursing) {
        setSelectedConditions((prev) => (prev.includes("PREGNANT") ? prev : [...prev, "PREGNANT"]));
      }
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
      setReport(repData);
      if (item.body_part) setBodyPart(item.body_part);
      if (Array.isArray(item.symptoms)) setSymptoms(item.symptoms.join(", "));
      if (typeof item.itch_score === "number") setItchScore(item.itch_score);
      if (typeof item.pain_score === "number") setPainScore(item.pain_score);
      if (Array.isArray(repData?.guide?.medication_guide)) {
        setMedications(repData.guide.medication_guide.map((m) => m.drug_name).join(", "));
      }
      setShareLinkInfo(null);
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
    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }
    const res = await fetch(`${API_BASE}/api/v1/schedules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: activeUserId, drug_name: schedDrug, dosage_note: schedNote, alarm_time: schedTime }),
    });
    if (res.ok) await loadSchedules(activeUserId);
  };

  const handleQuickAddSchedule = async (drugName, defaultNote) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/schedules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: activeUserId,
          drug_name: drugName,
          dosage_note: defaultNote,
          alarm_time: "21:00",
        }),
      });
      if (res.ok) {
        await loadSchedules(activeUserId);
        setShowScheduler(true);
        setQuickAddedDrug(drugName);
        setTimeout(() => setQuickAddedDrug(""), 2500);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleSchedule = async (scheduleId) => {
    const res = await fetch(`${API_BASE}/api/v1/schedules/${scheduleId}/toggle`, { method: "PATCH" });
    if (res.ok) await loadSchedules(activeUserId);
  };
  const handleDeleteSchedule = async (scheduleId) => {
    try {
      await fetch(`${API_BASE}/api/v1/schedules/${scheduleId}`, { method: "DELETE" });
    } catch (err) {
      console.error(err);
    } finally {
      setSchedules((prev) => prev.filter((item) => item.schedule_id !== scheduleId));
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
    formData.append("user_memo", `[발병·도포이력: ${onsetDuration}] ${userMemo}`);
    formData.append("current_medications", medications);
    if (imageFile) formData.append("image", imageFile);

    try {
      const res = await fetch(`${API_BASE}/api/v1/records`, { method: "POST", body: formData });
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
        console.error(err);
      }
    }, 1000);
  };

  const resolveImageUrl = (rawPath) => (rawPath ? `${API_BASE}/${rawPath.replace(/\\/g, "/")}` : "");

  const chronologicalHistory = [...historyList].reverse().slice(-7);
  const oldestRecord = chronologicalHistory.length >= 2 ? chronologicalHistory[0] : null;
  const latestRecord = chronologicalHistory.length >= 2 ? chronologicalHistory[chronologicalHistory.length - 1] : null;

  // [보호자·가족 전용 큰 글씨 뷰 + TTS]
  if (shareTokenFromUrl) {
    return (
      <div style={{ maxWidth: "780px", margin: "2rem auto", padding: "0 1.25rem", fontSize: "1.2rem", lineHeight: 1.7 }}>
        <div className="card" style={{ borderTop: "8px solid #0d6efd", padding: "2rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1rem" }}>
            <h1 style={{ fontSize: "1.8rem", margin: 0, color: "#0a4296" }}>👨‍👩‍👧 가족·보호자용 큰 글씨 복약 안내서</h1>
            {sharedData && (
              <button
                type="button"
                onClick={() =>
                  speakKoreanText(
                    `가족 보호자용 복약 안내서입니다. 예상 피부 소견은 ${sharedData.primary_disease_name}이며, 연고 권장 도포량은 ${sharedData.ftu_dosage_guide?.instruction || ""} 입니다.`
                  )
                }
                style={{ border: "none", borderRadius: "10px", padding: "0.65rem 1.1rem", background: "#0f766e", color: "#fff", fontWeight: 700, cursor: "pointer" }}
              >
                🔊 안내서 음성으로 듣기
              </button>
            )}
          </div>
          {shareError ? (
            <div className="alert-danger">⚠️ {shareError}</div>
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
                <div key={idx} className="alert-danger">
                  <strong>🚨 꼭 주의하세요 ({w.drug_name})</strong>
                  <div>{w.message}</div>
                </div>
              ))}
              <div className="ftu-box">
                <strong>📏 연고 바르는 양 ({sharedData.ftu_dosage_guide?.body_part_label})</strong>
                <div>{sharedData.ftu_dosage_guide?.instruction}</div>
              </div>
              <h3>💊 처방 의약품 주의사항</h3>
              {sharedData.medication_guide?.map((m, idx) => (
                <div key={idx} className="med-item">
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
      {alertBanner && (
        <div
          className="no-print"
          style={{ background: "#0f766e", color: "#fff", padding: "0.85rem 1.25rem", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}
        >
          <div>
            <strong>{alertBanner.title}</strong> ({alertBanner.time}) — {alertBanner.bodyText}
          </div>
          <button
            type="button"
            onClick={() => {
              window.speechSynthesis?.cancel();
              setAlertBanner(null);
            }}
            style={{ border: "none", borderRadius: "8px", padding: "0.35rem 0.75rem", background: "#fff", color: "#0f766e", fontWeight: 700, cursor: "pointer" }}
          >
            확인 완료
          </button>
        </div>
      )}

      <header className="app-header">
        <div className="header-inner">
          <div>
            <h1 className="header-title">🩺 MediGuide AI</h1>
            <p className="header-sub">설명 가능한(XAI) 피부 병변 스크리닝 & 식약처 DUR 기반 맞춤형 복약 가이드</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={toggleLargeTextMode}
              style={{
                border: "1px solid rgba(255,255,255,0.4)",
                borderRadius: "999px",
                padding: "0.4rem 0.9rem",
                fontWeight: 700,
                cursor: "pointer",
                background: largeTextMode ? "#fef08a" : "rgba(255,255,255,0.18)",
                color: largeTextMode ? "#0f172a" : "#fff",
                whiteSpace: "nowrap",
              }}
            >
              {largeTextMode ? "🔍 기본 글씨로" : "🔍 큰 글씨 모드"}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("analyze")}
              style={{
                border: "none",
                borderRadius: "999px",
                padding: "0.4rem 0.95rem",
                fontWeight: 700,
                cursor: "pointer",
                background: activeTab === "analyze" ? "#fff" : "rgba(255,255,255,0.18)",
                color: activeTab === "analyze" ? "#0a4296" : "#fff",
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
                background: activeTab === "history" ? "#fff" : "rgba(255,255,255,0.18)",
                color: activeTab === "history" ? "#0a4296" : "#fff",
              }}
            >
              📋 내 진단 히스토리 ({historyList.length})
            </button>

            {currentUser ? (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span className="version-badge">👤 {currentUser.name}님</span>
                <button
                  type="button"
                  onClick={handleLogout}
                  style={{ border: "1px solid rgba(255,255,255,0.45)", borderRadius: "999px", padding: "0.35rem 0.8rem", background: "transparent", color: "#fff", cursor: "pointer", fontSize: "0.8rem" }}
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

      {showAuthModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" }}>
          <div className="card" style={{ width: "100%", maxWidth: "420px", margin: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h2 className="card-title" style={{ margin: 0 }}>{authMode === "login" ? "🔐 MediGuide AI 로그인" : "📝 새 계정 회원가입"}</h2>
              <button type="button" onClick={() => setShowAuthModal(false)} style={{ border: "none", background: "transparent", fontSize: "1.2rem", cursor: "pointer" }}>
                ✕
              </button>
            </div>
            <form onSubmit={handleAuthSubmit}>
              {authMode === "register" && (
                <div className="form-group">
                  <label className="form-label">이름 (닉네임)</label>
                  <input type="text" className="form-control" value={authName} onChange={(e) => setAuthName(e.target.value)} required />
                </div>
              )}
              <div className="form-group">
                <label className="form-label">이메일</label>
                <input type="email" className="form-control" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">비밀번호</label>
                <input type="password" className="form-control" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} required />
              </div>
              {authMode === "register" && (
                <div className="form-group">
                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.88rem", cursor: "pointer" }}>
                    <input type="checkbox" checked={authPregnant} onChange={(e) => setAuthPregnant(e.target.checked)} />
                    임신부 또는 수유부입니다 (DUR 안전 경고 강화)
                  </label>
                </div>
              )}
              <button type="submit" className="btn-submit">{authMode === "login" ? "로그인하기" : "가입 완료 및 시작하기"}</button>
            </form>
            <div style={{ textAlign: "center", marginTop: "0.9rem", fontSize: "0.85rem" }}>
              {authMode === "login" ? (
                <>
                  아직 계정이 없으신가요?{" "}
                  <button type="button" onClick={() => setAuthMode("register")} style={{ border: "none", background: "none", color: "#0d6efd", fontWeight: 700, cursor: "pointer" }}>
                    회원가입
                  </button>
                </>
              ) : (
                <>
                  이미 계정이 있으신가요?{" "}
                  <button type="button" onClick={() => setAuthMode("login")} style={{ border: "none", background: "none", color: "#0d6efd", fontWeight: 700, cursor: "pointer" }}>
                    로그인
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "history" ? (
        <div style={{ maxWidth: "1020px", margin: "1.5rem auto", padding: "0 1.25rem" }}>
          {chronologicalHistory.length >= 2 && (
            <div className="card" style={{ marginBottom: "1.25rem" }}>
              <h2 className="card-title">📈 증상 호전도 추이 그래프 & 전·후 병변 비교</h2>
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "1.25rem", alignItems: "center" }}>
                <div style={{ background: "#f8fafc", padding: "1rem", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.84rem", marginBottom: "0.5rem" }}>
                    <strong>가려움 · 통증 지수 변화 (0~10점)</strong>
                    <span>
                      <span style={{ color: "#ef4444", fontWeight: 700 }}>● 가려움</span>{" "}
                      <span style={{ color: "#0d6efd", fontWeight: 700 }}>● 통증</span>
                    </span>
                  </div>
                  <svg viewBox="0 0 360 150" style={{ width: "100%", height: "150px", overflow: "visible" }}>
                    {[0, 5, 10].map((val) => {
                      const y = 120 - val * 10;
                      return (
                        <g key={val}>
                          <line x1="25" y1={y} x2="340" y2={y} stroke="#cbd5e1" strokeDasharray="3 3" />
                          <text x="5" y={y + 4} fontSize="10" fill="#64748b">{val}</text>
                        </g>
                      );
                    })}
                    <polyline
                      fill="none"
                      stroke="#ef4444"
                      strokeWidth="2.5"
                      points={chronologicalHistory
                        .map((item, i) => `${35 + (i * 290) / Math.max(1, chronologicalHistory.length - 1)},${120 - item.itch_score * 10}`)
                        .join(" ")}
                    />
                    <polyline
                      fill="none"
                      stroke="#0d6efd"
                      strokeWidth="2.5"
                      points={chronologicalHistory
                        .map((item, i) => `${35 + (i * 290) / Math.max(1, chronologicalHistory.length - 1)},${120 - item.pain_score * 10}`)
                        .join(" ")}
                    />
                    {chronologicalHistory.map((item, i) => {
                      const x = 35 + (i * 290) / Math.max(1, chronologicalHistory.length - 1);
                      return (
                        <g key={item.record_id}>
                          <circle cx={x} cy={120 - item.itch_score * 10} r="4" fill="#ef4444" />
                          <circle cx={x} cy={120 - item.pain_score * 10} r="4" fill="#0d6efd" />
                          <text x={x} y="142" fontSize="9" textAnchor="middle" fill="#475569">{item.created_at.slice(5, 10)}</text>
                        </g>
                      );
                    })}
                  </svg>
                </div>

                <div style={{ background: "#f8fafc", padding: "1rem", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                  <strong style={{ fontSize: "0.88rem", display: "block", marginBottom: "0.6rem" }}>🔍 초기 기록 vs 최근 기록 전·후 비교</strong>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.7rem", textAlign: "center" }}>
                    <div>
                      <div style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "0.25rem" }}>이전 ({oldestRecord.created_at.slice(5, 10)})</div>
                      {oldestRecord.gradcam_image_url && (
                        <img src={resolveImageUrl(oldestRecord.gradcam_image_url)} alt="이전" style={{ width: "100%", height: "95px", objectFit: "cover", borderRadius: "8px" }} />
                      )}
                      <div style={{ fontSize: "0.78rem", marginTop: "0.3rem" }}>
                        가려움 <strong>{oldestRecord.itch_score}</strong> · 통증 <strong>{oldestRecord.pain_score}</strong>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "0.75rem", color: "#0d6efd", fontWeight: 700, marginBottom: "0.25rem" }}>최근 ({latestRecord.created_at.slice(5, 10)})</div>
                      {latestRecord.gradcam_image_url && (
                        <img src={resolveImageUrl(latestRecord.gradcam_image_url)} alt="최근" style={{ width: "100%", height: "95px", objectFit: "cover", borderRadius: "8px", border: "2px solid #0d6efd" }} />
                      )}
                      <div style={{ fontSize: "0.78rem", marginTop: "0.3rem" }}>
                        가려움 <strong>{latestRecord.itch_score}</strong> · 통증 <strong>{latestRecord.pain_score}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <div>
                <h2 className="card-title" style={{ margin: 0 }}>📜 {currentUser ? `${currentUser.name}님의` : "게스트"} 피부 진단 및 경과 추적 히스토리</h2>
                <div className="form-hint" style={{ margin: "0.3rem 0 0 0" }}>과거 분석 카드를 클릭하면 당시의 Grad-CAM 히트맵과 복약 가이드를 다시 확인할 수 있습니다.</div>
              </div>
              <button type="button" onClick={() => setActiveTab("analyze")} className="btn-submit" style={{ width: "auto", padding: "0.55rem 1rem" }}>
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
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", cursor: "pointer", flexWrap: "wrap" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                      {item.gradcam_image_url ? (
                        <img src={resolveImageUrl(item.gradcam_image_url)} alt="히트맵" style={{ width: "68px", height: "68px", borderRadius: "10px", objectFit: "cover", border: "1px solid #cbd5e1" }} />
                      ) : (
                        <div style={{ width: "68px", height: "68px", borderRadius: "10px", background: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", color: "#64748b" }}>
                          이미지 없음
                        </div>
                      )}
                      <div>
                        <div style={{ fontSize: "0.82rem", color: "#64748b" }}>🕒 {item.created_at} · 부위: <strong>{item.body_part}</strong></div>
                        <strong style={{ fontSize: "1.08rem", color: "#0d6efd" }}>{item.primary_disease_name} ({(item.confidence_score * 100).toFixed(1)}%)</strong>
                        <div style={{ fontSize: "0.85rem", color: "#334155", marginTop: "0.2rem" }}>
                          가려움: <strong>{item.itch_score}/10</strong> · 통증: <strong>{item.pain_score}/10</strong> · 증상: {item.symptoms.join(", ")}
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
        <>
          <main className="main-container">
            <div className="no-print">
              <section className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
                  <h2 className="card-title" style={{ margin: 0, whiteSpace: "nowrap" }}>1. 피부 병변 문진</h2>
                  <button
                    type="button"
                    onClick={handleResetPatientForm}
                    style={{
                      background: "#f1f5f9",
                      color: "#334155",
                      border: "1px solid #cbd5e1",
                      borderRadius: "8px",
                      padding: "0.35rem 0.7rem",
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    🔄 다음 환자 초기화
                  </button>
                </div>

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
                  {/* 부위별 실시간 피부 민감도 & 주의 안내 배지 */}
                    {BODY_PART_SENSITIVITY_INFO[bodyPart] && (() => {
                      const info = BODY_PART_SENSITIVITY_INFO[bodyPart];
                      return (
                        <div
                          style={{
                            marginTop: "0.45rem",
                            padding: "0.48rem 0.68rem",
                            borderRadius: "8px",
                            background: info.bg,
                            border: `1px solid ${info.border}`,
                            color: info.color,
                            fontSize: "0.75rem",
                            lineHeight: 1.45,
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "0.38rem",
                            transition: "all 0.2s ease",
                          }}
                        >
                          <span style={{ flexShrink: 0 }}>{info.icon}</span>
                          <span>
                            <strong>[{info.level}]</strong> {info.text}
                          </span>
                        </div>
                      );
                    })()}
                    {/* */}
                  <div className="form-group">
                    <label className="form-label">주요 자각 증상 (쉼표 구분)</label>
                    <input type="text" className="form-control" value={symptoms} onChange={(e) => setSymptoms(e.target.value)} required />
                  </div>
                  {/* 주요 자각 증상 빠른 선택 칩 UI */}
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.38rem", marginTop: "0.45rem" }}>
                      <span style={{ fontSize: "0.73rem", color: "#64748b", fontWeight: 600 }}>빠른 증상:</span>
                      {QUICK_SYMPTOM_CHIPS.map((sym) => {
                        const isSelected = symptoms
                          .split(",")
                          .map((s) => s.trim())
                          .includes(sym);
                        return (
                          <button
                            key={sym}
                            type="button"
                            onClick={() => handleToggleQuickSymptom(sym)}
                            style={{
                              border: isSelected ? "1px solid #0d6efd" : "1px solid #cbd5e1",
                              background: isSelected ? "#eff6ff" : "#f8fafc",
                              color: isSelected ? "#0d6efd" : "#475569",
                              borderRadius: "999px",
                              padding: "0.2rem 0.58rem",
                              fontSize: "0.74rem",
                              fontWeight: isSelected ? 700 : 600,
                              cursor: "pointer",
                              transition: "all 0.15s ease",
                            }}
                          >
                            {isSelected ? `✓ ${sym}` : `+ ${sym}`}
                          </button>
                        );
                      })}
                    </div>
                    {/* [증상 칩 추가 끝] */}
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
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
                      <label className="form-label" style={{ margin: 0, whiteSpace: "nowrap" }}>처방/보유 의약품</label>
                      <label style={{ fontSize: "0.76rem", background: "#eff6ff", color: "#0d6efd", border: "1px solid #bfdbfe", padding: "0.28rem 0.6rem", borderRadius: "6px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                        {ocrLoading ? "⏳ OCR 스캔 중..." : "📄 처방전 OCR 자동입력"}
                        <input type="file" accept="image/*" onChange={handlePrescriptionOcr} style={{ display: "none" }} />
                      </label>
                    </div>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="예: 더모베이트연고0.05%, 에바스텔정10mg (쉼표로 구분)"
                      value={medications}
                      onChange={(e) => setMedications(e.target.value)}
                    />

                    {/*다빈도 피부과 처방약 원클릭 빠른 추가 칩 */}
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.38rem", marginTop: "0.45rem" }}>
                      <span style={{ fontSize: "0.73rem", color: "#64748b", fontWeight: 600 }}>빠른 추가:</span>
                      {QUICK_MEDICATION_CHIPS.map((drug) => {
                        const isSelected = medications
                          .split(",")
                          .map((m) => m.trim())
                          .includes(drug);
                        return (
                          <button
                            key={drug}
                            type="button"
                            onClick={() => handleToggleQuickMedication(drug)}
                            style={{
                              border: isSelected ? "1px solid #0d6efd" : "1px solid #cbd5e1",
                              background: isSelected ? "#eff6ff" : "#f8fafc",
                              color: isSelected ? "#0d6efd" : "#475569",
                              borderRadius: "999px",
                              padding: "0.2rem 0.58rem",
                              fontSize: "0.74rem",
                              fontWeight: isSelected ? 700 : 600,
                              cursor: "pointer",
                              transition: "all 0.15s ease",
                            }}
                          >
                            {isSelected ? `✓ ${drug}` : `+ ${drug}`}
                          </button>
                        );
                      })}
                    </div>

                    {ocrResultText && <div style={{ fontSize: "0.78rem", color: "#15803d", marginTop: "0.3rem", fontWeight: 600 }}>✅ {ocrResultText}</div>}
                  </div>
                  
                  <div className="form-group">
                    <button
                      type="button"
                      onClick={() => setShowExtraIntake(!showExtraIntake)}
                      style={{
                        width: "100%",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        background: "#f8fafc",
                        border: "1px solid #cbd5e1",
                        borderRadius: "8px",
                        padding: "0.6rem 0.85rem",
                        fontSize: "0.84rem",
                        fontWeight: 700,
                        color: "#334155",
                        cursor: "pointer",
                      }}
                    >
                      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
  🧬 알레르기 · 기저질환 · 상세 메모
  {(selectedAllergies.length + selectedConditions.length) > 0 && (
    <span style={{ marginLeft: "0.35rem", color: "#0d6efd" }}>
      ({selectedAllergies.length + selectedConditions.length}개)
    </span>
  )}
</span>
<span style={{ whiteSpace: "nowrap", flexShrink: 0 }}>{showExtraIntake ? "▲ 접기" : "▼ 펼치기"}</span>
                    </button>
                  </div>

                  {showExtraIntake && (
                    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "0.85rem", marginBottom: "1rem" }}>
                      <div className="form-group">
                        <label className="form-label">⏱️ 발병 시기 및 연고 도포 이력</label>
                        <select className="form-control" value={onsetDuration} onChange={(e) => setOnsetDuration(e.target.value)}>
                          <option value="1주 이내 (급성 발병 · 연고 미사용)">1주 이내 (급성 발병 · 연고 미사용)</option>
                          <option value="1~4주 (아급성 · 보습제/일반연고 사용)">1~4주 (아급성 · 보습제/일반연고 사용)</option>
                          <option value="1개월 이상 (만성·재발성 · 스테로이드 사용 이력)">1개월 이상 (만성·재발성 · 스테로이드 사용 이력)</option>
                          <option value="연고 도포 후 증상 악화됨">연고 도포 후 증상 악화됨</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label className="form-label">📝 상세 증상 메모</label>
                        <textarea
                          className="form-control"
                          rows={2}
                          placeholder="예: 밤에 가려움이 심해지고 세안 후 따가움이 있습니다."
                          value={userMemo}
                          onChange={(e) => setUserMemo(e.target.value)}
                          style={{ resize: "vertical" }}
                        />
                      </div>

                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">🧬 개인 약물 알레르기 · 기저질환 (맞춤형 DUR 검증)</label>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.45rem" }}>
                          {[
                            { id: "STEROID", label: "스테로이드 알레르기" },
                            { id: "ANTIBIOTIC", label: "항생제연고 알레르기" },
                            { id: "ANTIHISTAMINE", label: "항히스타민 과민" },
                          ].map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => toggleSelection(setSelectedAllergies, item.id)}
                              style={{
                                border: selectedAllergies.includes(item.id) ? "1.5px solid #d97706" : "1px solid #cbd5e1",
                                background: selectedAllergies.includes(item.id) ? "#fef3c7" : "#f8fafc",
                                color: selectedAllergies.includes(item.id) ? "#92400e" : "#475569",
                                borderRadius: "999px",
                                padding: "0.25rem 0.65rem",
                                fontSize: "0.78rem",
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              {selectedAllergies.includes(item.id) ? "✓ " : "+ "}
                              {item.label}
                            </button>
                          ))}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                          {[
                            { id: "PREGNANT", label: "임신·수유부" },
                            { id: "ELDERLY_CHILD", label: "소아·고령자" },
                            { id: "DIABETES", label: "당뇨·면역저하" },
                            { id: "GLAUCOMA", label: "녹내장·백내장" },
                          ].map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => toggleSelection(setSelectedConditions, item.id)}
                              style={{
                                border: selectedConditions.includes(item.id) ? "1.5px solid #0d6efd" : "1px solid #cbd5e1",
                                background: selectedConditions.includes(item.id) ? "#dbeafe" : "#f8fafc",
                                color: selectedConditions.includes(item.id) ? "#1e40af" : "#475569",
                                borderRadius: "999px",
                                padding: "0.25rem 0.65rem",
                                fontSize: "0.78rem",
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              {selectedConditions.includes(item.id) ? "✓ " : "+ "}
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="form-group">
                    <label className="form-label">실제 병변 사진 파일 첨부</label>
                    <label
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.3rem",
                        padding: "0.95rem",
                        border: "1.5px dashed #93c5fd",
                        borderRadius: "10px",
                        background: "#f8fafc",
                        cursor: "pointer",
                        textAlign: "center",
                      }}
                    >
                      <span style={{ fontSize: "1.25rem" }}>📷</span>
                      <span style={{ fontSize: "0.84rem", fontWeight: 700, color: "#0d6efd" }}>
                        {imageFile ? `선택됨: ${imageFile.name}` : "클릭하여 피부 병변 사진 선택 (JPG, PNG)"}
                      </span>
                      <span style={{ fontSize: "0.74rem", color: "#64748b" }}>미첨부 시 입력된 증상·문진 데이터 기반으로 분석됩니다</span>
                      <input type="file" accept="image/*" onChange={handleFileChange} style={{ display: "none" }} />
                    </label>
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

              {/* 복약·연고 도포 알림 스케줄러 */}
              <section className="card">
                <div
                  onClick={() => setShowScheduler(!showScheduler)}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    cursor: "pointer",
                    marginBottom: showScheduler ? "0.85rem" : 0,
                  }}
                >
                  <h2 className="card-title" style={{ margin: 0, fontSize: "1.02rem" }}>
                    ⏰ 복약 · 도포 알림 스케줄러 ({schedules.length}건)
                  </h2>
                  <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#0d6efd" }}>
                    {showScheduler ? "▲ 접기" : "▼ 펼치기"}
                  </span>
                </div>

                {showScheduler && (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.75rem" }}>
                      <button
                        type="button"
                        onClick={() => setTtsEnabled((prev) => !prev)}
                        style={{ border: "1px solid #cbd5e1", borderRadius: "8px", padding: "0.28rem 0.55rem", fontSize: "0.76rem", fontWeight: 700, background: ttsEnabled ? "#ecfdf5" : "#f1f5f9", color: ttsEnabled ? "#047857" : "#64748b", cursor: "pointer" }}
                      >
                        {ttsEnabled ? "🔊 음성 ON" : "🔇 음성 OFF"}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          const target = schedules.find((s) => s.is_active) || { drug_name: schedDrug, dosage_note: schedNote };
                          const info = await triggerMedicationAlert(target.drug_name, target.dosage_note, ttsEnabled);
                          setAlertBanner(info);
                        }}
                        style={{ border: "none", borderRadius: "8px", padding: "0.3rem 0.6rem", fontSize: "0.76rem", fontWeight: 700, background: "#0d6efd", color: "#fff", cursor: "pointer" }}
                      >
                        🔔 알림·음성 테스트
                      </button>
                    </div>

                    <form onSubmit={handleAddSchedule} style={{ display: "grid", gap: "0.6rem", marginBottom: "1rem" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 110px", gap: "0.5rem" }}>
                        <input type="text" className="form-control" placeholder="의약품명" value={schedDrug} onChange={(e) => setSchedDrug(e.target.value)} required />
                        <input type="time" className="form-control" value={schedTime} onChange={(e) => setSchedTime(e.target.value)} required />
                      </div>
                      <input type="text" className="form-control" placeholder="도포/복용 메모" value={schedNote} onChange={(e) => setSchedNote(e.target.value)} />
                      <button type="submit" className="btn-submit" style={{ background: "#0f766e", padding: "0.6rem" }}>+ 알림 스케줄 추가</button>
                    </form>

                    {schedules.length === 0 ? (
                      <div className="form-hint">등록된 복약 알림이 없습니다.</div>
                    ) : (
                      schedules.map((s) => (
                        <div key={s.schedule_id} className="med-item" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", opacity: s.is_active ? 1 : 0.6 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <strong style={{ color: s.is_active ? "#0d6efd" : "#64748b" }}>{s.alarm_time}</strong> · <strong>{s.drug_name}</strong>
                            <div className="form-hint" style={{ margin: 0 }}>{s.dosage_note}</div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexShrink: 0 }}>
                            <button
                              type="button"
                              title="음성 미리듣기"
                              onClick={() => speakKoreanText(`${s.alarm_time} 알림. ${s.drug_name}. ${s.dosage_note}`)}
                              style={{ border: "1px solid #cbd5e1", borderRadius: "8px", padding: "0.32rem 0.5rem", background: "#fff", cursor: "pointer", fontSize: "0.8rem" }}
                            >
                              🔊
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleSchedule(s.schedule_id)}
                              style={{
                                border: "none",
                                borderRadius: "8px",
                                padding: "0.34rem 0.62rem",
                                cursor: "pointer",
                                fontWeight: 700,
                                fontSize: "0.76rem",
                                background: s.is_active ? "#dcfce7" : "#fee2e2",
                                color: s.is_active ? "#166534" : "#991b1b",
                              }}
                            >
                              {s.is_active ? "🔔 ON" : "🔕 OFF"}
                            </button>
                            <button
                              type="button"
                              title="알림 삭제"
                              onClick={() => handleDeleteSchedule(s.schedule_id)}
                              style={{
                                border: "1px solid #fecaca",
                                borderRadius: "8px",
                                padding: "0.32rem 0.5rem",
                                background: "#fff",
                                color: "#dc2626",
                                cursor: "pointer",
                                fontSize: "0.78rem",
                                fontWeight: 700,
                              }}
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </>
                )}
              </section>
            </div>

            <section>
              {taskStatus && (
                <div className="card no-print">
                  <div className="progress-header">
                    <strong>🔬 AI 비동기 분석 파이프라인</strong>
                    <span className="status-pill">{taskStatus.status}</span>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${taskStatus.progress_percent}%` }}>{taskStatus.progress_percent}%</div>
                  </div>
                  <div className="form-hint">{taskStatus.message}</div>
                </div>
              )}

              {!taskStatus && !report && <MainWelcomePanel onApplySample={handleApplySampleCase} />}

              {report && (
                <>
                  <div className="print-only-header">
                    <h2 style={{ margin: 0, color: "#0a4296" }}>🩺 MediGuide AI - 피부과 진료 참고용 요약 리포트</h2>
                    <div style={{ fontSize: "0.9rem", color: "#334155", marginTop: "0.35rem" }}>
                      환자명: <strong>{currentUser ? currentUser.name : "게스트"}</strong> · 출력일시: <strong>{new Date().toLocaleString("ko-KR")}</strong> · 발생부위:{" "}
                      <strong>{bodyPart}</strong> · 가려움: <strong>{itchScore}/10</strong> · 통증: <strong>{painScore}/10</strong>
                    </div>
                  </div>

                  <div className="card no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                    <div>
                      <strong>🏥 진료 준비 및 가족 공유 도구</strong>
                      <div className="form-hint" style={{ margin: 0 }}>병원 진료 시 PDF로 출력해 보여주거나, 주변 피부과·약국 및 가족 공유 링크를 이용하세요.</div>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      <button type="button" onClick={() => window.print()} style={{ border: "none", borderRadius: "10px", padding: "0.6rem 0.95rem", background: "#0d6efd", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
                        🖨️ 진료용 PDF / 인쇄
                      </button>
                      <a href="https://map.naver.com/p/search/피부과" target="_blank" rel="noreferrer" style={{ borderRadius: "10px", padding: "0.6rem 0.95rem", background: "#0f766e", color: "#fff", fontWeight: 700, textDecoration: "none", fontSize: "0.86rem", display: "inline-flex", alignItems: "center" }}>
                        🏥 주변 피부과
                      </a>
                      <a href="https://map.naver.com/p/search/약국" target="_blank" rel="noreferrer" style={{ borderRadius: "10px", padding: "0.6rem 0.95rem", background: "#0369a1", color: "#fff", fontWeight: 700, textDecoration: "none", fontSize: "0.86rem", display: "inline-flex", alignItems: "center" }}>
                        💊 주변 약국
                      </a>
                      <button type="button" onClick={handleCreateShareLink} style={{ border: "none", borderRadius: "10px", padding: "0.6rem 0.95rem", background: "#1e293b", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
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

                  <EmergencyTriageBanner symptoms={symptoms} userMemo={userMemo} painScore={painScore} />
                  <PersonalDurBanner
                    medications={medications}
                    bodyPart={bodyPart}
                    selectedAllergies={selectedAllergies}
                    selectedConditions={selectedConditions}
                  />

                  {report.guide.dur_warnings?.length > 0 ? (
                    report.guide.dur_warnings.map((w, idx) => (
                      <div key={idx} className="alert-danger">
                        <strong>🚨 [DUR 안전 경고 - {w.drug_name}]</strong>
                        <div>{w.message}</div>
                      </div>
                    ))
                  ) : (
                    <div className="alert-success">✅ 입력된 부위 및 처방약에서 특이 DUR 금기 사항이 발견되지 않았습니다.</div>
                  )}

                  {(() => {
                    const steroidMeds = (report.guide.medication_guide || []).filter(
                      (m) =>
                        m.guidance_summary?.includes("스테로이드") ||
                        /더모베이트|리도멕스|데소나|락티케어|모메타손|베타메타손|클로베타솔|하이드로코르티손|프레드니솔론/i.test(m.drug_name)
                    );
                    if (steroidMeds.length >= 2) {
                      return (
                        <div className="alert-danger">
                          <strong>⚠️ [DUR 동일 효능군 중복 주의 - 외용 스테로이드 {steroidMeds.length}종]</strong>
                          <div>
                            현재 <strong>{steroidMeds.map((m) => m.drug_name).join(", ")}</strong> 등 외용 스테로이드 제제가 중복 포함되어 있습니다. 동일 부위 중복 도포 시 전신 흡수 및 피부 위축 부작용 위험이 커지므로 부위별 구분 사용 여부를 의사·약사와 반드시 확인하세요.
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  <div className="card">
                    <div className="progress-header">
                      <h2 className="card-title" style={{ margin: 0 }}>2. AI 병변 스크리닝 & Grad-CAM 히트맵</h2>
                      <span className="status-pill">{report.screening.risk_level}</span>
                    </div>
                    <div className="xai-grid" style={{ marginTop: "1rem" }}>
                      <div style={{ textAlign: "center" }}>
                        <div className="xai-viewer">
                          <img src={resolveImageUrl(report.screening.original_image_url)} alt="원본 병변" />
                          <img src={resolveImageUrl(report.screening.gradcam_image_url)} alt="Grad-CAM" style={{ opacity: heatmapOpacity / 100 }} />
                        </div>
                        <div className="no-print" style={{ marginTop: "0.6rem" }}>
                          <label className="form-label">히트맵 투명도 조절: {heatmapOpacity}%</label>
                          <input type="range" min="0" max="100" value={heatmapOpacity} onChange={(e) => setHeatmapOpacity(Number(e.target.value))} style={{ width: "90%" }} />
                        </div>
                      </div>
                      <div>
                        <div className="disease-highlight">
                          <div className="form-hint">1순위 예측 질환</div>
                          <h3 className="disease-name">{report.screening.primary_disease_name} ({(report.screening.confidence_score * 100).toFixed(1)}%)</h3>
                          <div style={{ fontSize: "0.86rem", color: "#475569" }}>{report.screening.visual_finding_summary}</div>
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
               </>
                )}
              </section>
            </main>

          {report && (
            <>
              <div className="report-bottom-wrap" style={{ maxWidth: "1280px", margin: "1.25rem auto 0 auto", padding: "0 1.25rem 1.25rem 1.25rem" }}>
                <div className="card" style={{ margin: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.85rem" }}>
                    <h2 className="card-title" style={{ margin: 0 }}>3. 맞춤형 FTU 정량 도포 및 복약 가이드</h2>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#0369a1", background: "#e0f2fe", padding: "0.25rem 0.65rem", borderRadius: "999px" }}>
                      식약처 e약은요 · 심평원 DUR 검증
                    </span>
                  </div>

                  <div className="ftu-box">
                    <strong>
                      📏 권장 도포량 ({report.guide.ftu_dosage_guide.body_part_label}): {report.guide.ftu_dosage_guide.recommended_ftu} FTU ({report.guide.ftu_dosage_guide.recommended_grams}g)
                    </strong>
                    <div style={{ marginTop: "0.25rem" }}>{report.guide.ftu_dosage_guide.instruction}</div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "0.9rem" }}>
                    {report.guide.medication_guide.map((m, idx) => {
                      const { gradeBadge, lines } = parseMedicationSummary(m.guidance_summary);
                      const isHighPotency = gradeBadge.includes("1등급") || gradeBadge.includes("초강력");
                      // 스테로이드 게이지 메타 정보 계산
                      const steroidMeta = getSteroidPotencyMeta(m.drug_name, gradeBadge, m.guidance_summary);
                    
                      return (
                        <div key={idx} className="med-item" style={{ margin: 0, padding: "0.95rem 1.05rem" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.45rem" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
                              <strong style={{ fontSize: "0.96rem", color: "#0f172a" }}>💊 {m.drug_name}</strong>
                              {gradeBadge && (
                                <span
                                  style={{
                                    fontSize: "0.72rem",
                                    fontWeight: 700,
                                    padding: "0.18rem 0.52rem",
                                    borderRadius: "999px",
                                    background: isHighPotency ? "#fee2e2" : "#eff6ff",
                                    color: isHighPotency ? "#b91c1c" : "#1d4ed8",
                                    border: isHighPotency ? "1px solid #fecaca" : "1px solid #bfdbfe",
                                  }}
                                >
                                  {gradeBadge}
                                </span>
                              )}
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                              <span style={{ fontSize: "0.75rem", color: "#475569", background: "#f1f5f9", padding: "0.18rem 0.55rem", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                                성분: {m.ingredient}
                              </span>
                              <button
                                type="button"
                                className="no-print"
                                onClick={() =>
                                  handleQuickAddSchedule(
                                    m.drug_name,
                                    `${report.guide.ftu_dosage_guide.body_part_label} 권장량(${report.guide.ftu_dosage_guide.recommended_ftu} FTU) 기준 복약·도포`
                                  )
                                }
                                style={{
                                  border: "1px solid #99f6e4",
                                  background: quickAddedDrug === m.drug_name ? "#0f766e" : "#f0fdfa",
                                  color: quickAddedDrug === m.drug_name ? "#fff" : "#0f766e",
                                  borderRadius: "6px",
                                  padding: "0.18rem 0.52rem",
                                  fontSize: "0.74rem",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                }}
                              >
                                {quickAddedDrug === m.drug_name ? "✓ 스케줄 등록됨" : "⏰ + 알림 등록"}
                              </button>
                            </div>
                          </div>
                          {/* 스테로이드 1~7등급 시각적 스펙트럼 게이지 바 */}
                          {steroidMeta && (
                            <div
                              style={{
                                marginTop: "0.6rem",
                                padding: "0.6rem 0.75rem",
                                borderRadius: "8px",
                                background: steroidMeta.level <= 2 ? "#fef2f2" : "#f8fafc",
                                border: steroidMeta.level <= 2 ? "1px solid #fecaca" : "1px solid #e2e8f0",
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.3rem", fontSize: "0.75rem", marginBottom: "0.38rem" }}>
                                <strong style={{ color: steroidMeta.level <= 2 ? "#b91c1c" : "#1e293b" }}>
                                  📊 외용 스테로이드 강도 스펙트럼: {steroidMeta.label} (1초강력 → 7최약)
                                </strong>
                                <span style={{ color: "#475569", fontWeight: 600 }}>⏱️ {steroidMeta.guideText}</span>
                              </div>
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px" }}>
                                {[
                                  { lv: 1, color: "#dc2626", text: "1" },
                                  { lv: 2, color: "#ea580c", text: "2" },
                                  { lv: 3, color: "#f59e0b", text: "3" },
                                  { lv: 4, color: "#eab308", text: "4" },
                                  { lv: 5, color: "#84cc16", text: "5" },
                                  { lv: 6, color: "#22c55e", text: "6" },
                                  { lv: 7, color: "#10b981", text: "7" },
                                ].map((seg) => {
                                  const isCurrent = seg.lv === steroidMeta.level;
                                  return (
                                    <div
                                      key={seg.lv}
                                      style={{
                                        height: isCurrent ? "16px" : "10px",
                                        alignSelf: "center",
                                        borderRadius: "4px",
                                        background: seg.color,
                                        opacity: isCurrent ? 1 : 0.28,
                                        border: isCurrent ? "2px solid #0f172a" : "none",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        fontSize: "0.64rem",
                                        fontWeight: 800,
                                        color: "#fff",
                                        transition: "all 0.2s ease",
                                      }}
                                    >
                                      {isCurrent ? `${seg.text}등급` : ""}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        
                          <div style={{ marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.35rem", fontSize: "0.84rem", lineHeight: 1.55, color: "#334155", wordBreak: "keep-all" }}>
                            {lines.map((line, lineIdx) => {
                              const colonIndex = line.indexOf(":");
                              if (colonIndex > 0 && colonIndex < 22) {
                                const label = line.slice(0, colonIndex + 1);
                                const content = line.slice(colonIndex + 1).trim();
                                return (
                                  <div key={lineIdx} style={{ display: "flex", gap: "0.35rem", alignItems: "flex-start" }}>
                                    <span style={{ color: "#0d6efd", fontWeight: 700 }}>•</span>
                                    <span>
                                      <strong style={{ color: "#1e293b" }}>{label}</strong> {content}
                                    </span>
                                  </div>
                                );
                              }
                              return (
                                <p key={lineIdx} style={{ margin: 0 }}>
                                  {line}
                                </p>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="two-col-grid" style={{ marginTop: "0.95rem" }}>
                    <div className="sub-box">
                      <strong style={{ color: "#15803d" }}>🌿 생활 습관 관리</strong>
                      <ul style={{ paddingLeft: "1.2rem", margin: "0.5rem 0 0 0", fontSize: "0.85rem", lineHeight: 1.5 }}>
                        {report.guide.lifestyle_guide.map((l, idx) => (
                          <li key={idx} style={{ marginBottom: "0.25rem" }}>{l}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="sub-box">
                      <strong style={{ color: "#1d4ed8" }}>💬 다음 진료 시 의사 질문 3선</strong>
                      <ol style={{ paddingLeft: "1.2rem", margin: "0.5rem 0 0 0", fontSize: "0.85rem", lineHeight: 1.5 }}>
                        {report.guide.doctor_questions.map((q, idx) => (
                          <li key={idx} style={{ marginBottom: "0.25rem" }}>{q}</li>
                        ))}
                      </ol>
                    </div>
                  </div>
                  {/* 진료 후 증상 변화 추적용 도포·복약 체크리스트 & 경과 메모 위젯 */}
                  <div
                    style={{
                      marginTop: "0.95rem",
                      padding: "0.95rem 1.05rem",
                      borderRadius: "10px",
                      background: "#f0fdf4",
                      border: "1px solid #bbf7d0",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.65rem" }}>
                      <strong style={{ color: "#166534", fontSize: "0.92rem" }}>
                        📋 오늘의 도포·복약 자가 체크 & 경과 메모 (인쇄·모바일 겸용)
                      </strong>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          padding: "0.2rem 0.6rem",
                          borderRadius: "999px",
                          background: completedCheckCount === 4 ? "#15803d" : "#dcfce7",
                          color: completedCheckCount === 4 ? "#fff" : "#166534",
                        }}
                      >
                        달성률 {completedCheckCount} / 4 완료
                      </span>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "0.5rem", marginBottom: "0.7rem" }}>
                      {[
                        { key: "morningApply", label: "☀️ 아침 처방약 도포 / 복용 완료" },
                        { key: "eveningApply", label: "🌙 저녁 처방약 도포 / 복용 완료" },
                        { key: "moisturizerGap", label: "🧴 보습제와 15분 이상 간격 준수" },
                        { key: "itchImproved", label: "✨ 어제보다 붉은기·가려움 완화됨" },
                      ].map((item) => {
                        const checked = aftercareChecks[item.key];
                        return (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => toggleAftercareCheck(item.key)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.45rem",
                              textAlign: "left",
                              padding: "0.52rem 0.72rem",
                              borderRadius: "8px",
                              border: checked ? "1.5px solid #16a34a" : "1px solid #cbd5e1",
                              background: checked ? "#dcfce7" : "#ffffff",
                              color: checked ? "#14532d" : "#334155",
                              fontSize: "0.81rem",
                              fontWeight: checked ? 700 : 500,
                              cursor: "pointer",
                              transition: "all 0.15s ease",
                            }}
                          >
                            <span style={{ fontSize: "0.95rem" }}>{checked ? "☑️" : "⬜"}</span>
                            <span>{item.label}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                      <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#166534" }}>
                        ✍️ 오늘의 피부 변화 · 특이 반응 메모 (다음 진료 시 의료진 참고용)
                      </label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="예: 저녁 도포 후 화끈거림 없음, 각질이 절반 정도 가라앉음 (인쇄 시 그대로 출력됩니다)"
                        value={aftercareNote}
                        onChange={(e) => setAftercareNote(e.target.value)}
                        style={{ background: "#ffffff", fontSize: "0.83rem" }}
                      />
                    </div>
                  </div>
                  
                  <details style={{ marginTop: "1rem", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "0.6rem 0.85rem" }}>
                    <summary style={{ cursor: "pointer", fontSize: "0.8rem", fontWeight: 600, color: "#475569" }}>
                      📚 RAG 의학적 근거 출처 상세 보기 ({report.guide.retrieved_sources?.length || 0}건)
                    </summary>
                    <ul style={{ paddingLeft: "1.2rem", margin: "0.5rem 0 0 0", fontSize: "0.78rem", color: "#64748b", lineHeight: 1.5 }}>
                      {report.guide.retrieved_sources.map((s, idx) => (
                        <li key={idx}>
                          [{s.doc_id}] {s.organization} - {s.title} (유사도: {s.similarity_score})
                        </li>
                      ))}
                    </ul>
                   
                  </details>
                </div>

                <div className="disclaimer-bar" style={{ marginTop: "0.75rem" }}>※ {report.disclaimer}</div>
              </div>

             {/* 화면 우측 하단 접이식 AI 복약·생활 Q&A 상담 플로팅 위젯 */}
              <aside className="no-print floating-chat-dock">
                <details style={{ position: "relative" }}>
                  <summary
                    style={{
                      listStyle: "none",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.55rem",
                      background: "linear-gradient(135deg, #0d6efd 0%, #0a4296 100%)",
                      color: "#ffffff",
                      borderRadius: "999px",
                      padding: "0.85rem 1.35rem",
                      fontSize: "0.94rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      boxShadow: "0 8px 24px rgba(13, 110, 253, 0.35)",
                      userSelect: "none",
                    }}
                  >
                    <span>💬 AI 복약 · 생활 Q&A 상담 열기 / 접기</span>
                  </summary>
                  <div style={{ marginTop: "0.65rem" }}>
                    <ReportChatBox report={report} bodyPart={bodyPart} />
                  </div>
                </details>
              </aside>
            </>
          )}
        </>
      )}
      <AppFooter />
    </div>
  );
}
