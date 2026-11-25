import React, { useState, useEffect, useRef } from "react";
import "./App.css";
import EmergencyTriageBanner from "./EmergencyTriageBanner";
import PersonalDurBanner from "./PersonalDurBanner";
import ClinicalGuideCard from "./ClinicalGuideCard";
import ReportChatBox from "./ReportChatBox";
import MainWelcomePanel from "./MainWelcomePanel";
import AppFooter from "./AppFooter";
import { parseMedicationSummary } from "./alertHelper";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

const ALLERGY_OPTIONS = [
  "스테로이드 외용제 과민증",
  "항히스타민제 졸음·과민",
  "항생제(페니실린·마크로라이드) 알레르기",
  "진통소염제(NSAIDs) 알레르기",
  "라놀린·보습제 성분 접촉 알레르기",
];

const CONDITION_OPTIONS = [
  { code: "PREGNANT", label: "임신 중 또는 수유부" },
  { code: "INFANT_CHILD", label: "영유아·소아 환자" },
  { code: "DIABETES", label: "당뇨병 (피부 감염·위축 주의)" },
  { code: "HYPERTENSION", label: "고혈압·심혈관 질환" },
  { code: "GLAUCOMA_CATARACT", label: "녹내장·백내장 (안면 스테로이드 주의)" },
];

const QUICK_MED_CHIPS = [
  "더모베이트연고0.05%",
  "리도멕스크림0.15%",
  "에바스텔정10mg",
  "비판텐연고",
];

export default function App() {
  const [nowText, setNowText] = useState(() =>
    new Date().toLocaleString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  );

  useEffect(() => {
    const clockTimer = setInterval(() => {
      setNowText(
        new Date().toLocaleString("ko-KR", {
          month: "2-digit",
          day: "2-digit",
          weekday: "short",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    }, 1000);
    return () => clearInterval(clockTimer);
  }, []);
  
  // 인증 및 사용자 상태
  const [currentUser, setCurrentUser] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authPregnant, setAuthPregnant] = useState(false);

  // 탭 및 과거 이력 상태
  const [activeTab, setActiveTab] = useState("analyze");
  const [historyList, setHistoryList] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // 1. 문진 및 이미지 입력 상태
  const [bodyPart, setBodyPart] = useState("TRUNK");
  const [symptoms, setSymptoms] = useState("광범위 수포, 진물, 고열, 심한 화끈거림");
  const [itchScore, setItchScore] = useState(6);
  const [painScore, setPainScore] = useState(2);
  const [medications, setMedications] = useState("더모베이트연고0.05%, 에바스텔정10mg");
  const [selectedAllergies, setSelectedAllergies] = useState([]);
  const [selectedConditions, setSelectedConditions] = useState([]);
  const [clinicalNote, setClinicalNote] = useState("");
  const [showExtraIntake, setShowExtraIntake] = useState(false);

  // 이미지 업로드 & Grad-CAM 투명도
  const [imageFile, setImageFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
  const [heatmapOpacity, setHeatmapOpacity] = useState(0.65);

  // OCR 상태
  const [ocrLoading, setOcrLoading] = useState(false);
  const ocrInputRef = useRef(null);

  // 비동기 태스크 및 결과 리포트 상태
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState(null);
  const [taskStatus, setTaskStatus] = useState(null);
  const [report, setReport] = useState(null);

  // 가족 공유 링크 상태
  const [shareLinkInfo, setShareLinkInfo] = useState(null);

  // 복약 스케줄러 & 음성 알림 상태
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

  // 로그인 세션 복원
  useEffect(() => {
    const token = localStorage.getItem("mediguide_token");
    if (!token) return;
    fetch(`${API_BASE}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((user) => {
        if (user) {
          setCurrentUser(user);
          if (user.is_pregnant_or_nursing) {
            setSelectedConditions((prev) => (prev.includes("PREGNANT") ? prev : [...prev, "PREGNANT"]));
          }
        } else {
          localStorage.removeItem("mediguide_token");
        }
      })
      .catch(() => {});
  }, []);

  // 복약 스케줄 초기 로드
  const fetchSchedules = async () => {
    try {
      const token = localStorage.getItem("mediguide_token");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${API_BASE}/api/v1/schedules`, { headers });
      if (res.ok) {
        const data = await res.json();
        setSchedules(data);
      }
    } catch (e) {
      console.error("스케줄 조회 실패:", e);
    }
  };

  useEffect(() => {
    fetchSchedules();
  }, [currentUser]);

  // 인쇄(PDF) 실행 직전 RAG 의학적 근거 출처 상세 보기 자동 펼침
  useEffect(() => {
    const handleBeforePrint = () => {
      document.querySelectorAll(".report-bottom-wrap details").forEach((el) => {
        el.setAttribute("open", "true");
      });
    };
    window.addEventListener("beforeprint", handleBeforePrint);
    return () => window.removeEventListener("beforeprint", handleBeforePrint);
  }, []);

  // 15초 주기로 현재 시각(HH:MM)과 활성 스케줄 비교하여 알람 트리거
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      const currentHHMM = `${hh}:${mm}`;

      if (triggeredMinuteRef.current === currentHHMM) return;

      const matched = schedules.filter((s) => s.is_active && s.alarm_time === currentHHMM);
      if (matched.length > 0) {
        triggeredMinuteRef.current = currentHHMM;
        const target = matched[0];
        const msg = `⏰ [${currentHHMM}] ${target.drug_name} 복약·도포 시간입니다! (${target.dosage_note})`;
        setActiveAlertBanner(msg);
        speakKoreanText(`${target.drug_name} 복약 및 도포 시간입니다. ${target.dosage_note}`);
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("MediGuide AI 복약·도포 알림", { body: msg });
        }
      }
    }, 15000);
    return () => clearInterval(timer);
  }, [schedules]);

  // 과거 진료 이력 조회
  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const token = localStorage.getItem("mediguide_token");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${API_BASE}/api/v1/history?limit=20`, { headers });
      if (res.ok) {
        const data = await res.json();
        setHistoryList(data);
      }
    } catch (e) {
      console.error("이력 조회 실패:", e);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (activeTab === "history") {
      fetchHistory();
    }
  }, [activeTab, currentUser]);

  // 비동기 태스크 폴링 (1.2초 간격)
  useEffect(() => {
    if (!currentTaskId) return;
    const interval = setInterval(async () => {
      try {
        const statusRes = await fetch(`${API_BASE}/api/v1/tasks/${currentTaskId}`);
        if (!statusRes.ok) return;
        const st = await statusRes.json();
        setTaskStatus(st);

        if (st.status === "COMPLETED") {
          clearInterval(interval);
          setIsSubmitting(false);
          const repRes = await fetch(`${API_BASE}/api/v1/reports/${currentTaskId}`);
          if (repRes.ok) {
            const repData = await repRes.json();
            setReport(repData);
          }
        } else if (st.status === "FAILED") {
          clearInterval(interval);
          setIsSubmitting(false);
        }
      } catch (err) {
        console.error("폴링 오류:", err);
      }
    }, 1200);

    return () => clearInterval(interval);
  }, [currentTaskId]);

  // 회원가입 / 로그인 제출
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    try {
      const endpoint = authMode === "login" ? "/api/v1/auth/login" : "/api/v1/auth/register";
      const payload =
        authMode === "login"
          ? { email: authEmail, password: authPassword }
          : {
              email: authEmail,
              password: authPassword,
              full_name: authName || "환자 사용자",
              is_pregnant_or_nursing: authPregnant,
            };

      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
      if (item.body_part) setBodyPart(item.body_part);
      if (Array.isArray(item.symptoms)) setSymptoms(item.symptoms.join(", "));
      if (typeof item.itch_score === "number") setItchScore(item.itch_score);
      if (typeof item.pain_score === "number") setPainScore(item.pain_score);
      if (Array.isArray(repData?.guide?.medication_guide)) {
        setMedications(repData.guide.medication_guide.map((m) => m.drug_name).join(", "));
      }
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
    try {
      if ("Notification" in window && Notification.permission === "default") {
        await Notification.requestPermission();
      }
      const token = localStorage.getItem("mediguide_token");
      const headers = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      const res = await fetch(`${API_BASE}/api/v1/schedules`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          drug_name: newAlarmDrug,
          alarm_time: newAlarmTime,
          dosage_note: newAlarmNote,
        }),
      });
      if (res.ok) {
        await fetchSchedules();
      }
    } catch (err) {
      alert("알림 등록 실패: " + err.message);
    }
  };

  const handleToggleSchedule = async (scheduleId) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/schedules/${scheduleId}/toggle`, {
        method: "PATCH",
      });
      if (res.ok) {
        await fetchSchedules();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteSchedule = async (scheduleId) => {
    try {
      await fetch(`${API_BASE}/api/v1/schedules/${scheduleId}`, {
        method: "DELETE",
      });
    } catch (err) {
      console.error(err);
    } finally {
      setSchedules((prev) => prev.filter((item) => item.schedule_id !== scheduleId));
    }
  };

  const handleQuickAddSchedule = async (drugName, noteText) => {
    try {
      if ("Notification" in window && Notification.permission === "default") {
        await Notification.requestPermission();
      }
      const token = localStorage.getItem("mediguide_token");
      const headers = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      const res = await fetch(`${API_BASE}/api/v1/schedules`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          drug_name: drugName,
          alarm_time: "09:00",
          dosage_note: noteText || "1일 1~2회 권장 정량 도포·복용",
        }),
      });
      if (res.ok) {
        await fetchSchedules();
        setShowScheduler(true);
      }
    } catch (err) {
      alert("원클릭 알림 등록 오류: " + err.message);
    }
  };

  // 처방약 원클릭 빠른 추가 칩 핸들러
  const handleQuickAddMedicationChip = (drugName) => {
    const currentList = medications
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (currentList.includes(drugName)) {
      const filtered = currentList.filter((item) => item !== drugName);
      setMedications(filtered.join(", "));
    } else {
      setMedications([...currentList, drugName].join(", "));
    }
  };

  // 가족/보호자 안심 공유 링크 생성
  const handleCreateShareLink = async () => {
    if (!currentTaskId) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/reports/${currentTaskId}/share`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setShareLinkInfo(data);
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(data.share_url);
        }
      }
    } catch (err) {
      alert("공유 링크 생성 오류: " + err.message);
    }
  };

  // 다음 환자 초기화
  const handleResetCase = () => {
    setReport(null);
    setTaskStatus(null);
    setCurrentTaskId(null);
    setShareLinkInfo(null);
    setImageFile(null);
    setImagePreviewUrl(null);
    setSymptoms("");
    setMedications("");
    setSelectedAllergies([]);
    setClinicalNote("");
  };

  // 처방전/약봉투 OCR 자동 입력
  const handleOcrFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_BASE}/api/v1/ocr/prescription`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("OCR 추출 실패");
      const data = await res.json();
      if (data.detected_medications && data.detected_medications.length > 0) {
        const existing = medications
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const merged = Array.from(new Set([...existing, ...data.detected_medications]));
        setMedications(merged.join(", "));
        alert(`[OCR 인식 완료] 처방 의약품 ${data.detected_medications.join(", ")} 자동 입력되었습니다.`);
      } else {
        alert("이미지에서 등록된 피부과 처방 약품명을 찾지 못했습니다.");
      }
    } catch (err) {
      alert("처방전 OCR 처리 오류: " + err.message);
    } finally {
      setOcrLoading(false);
      e.target.value = "";
    }
  };

  // 병변 이미지 파일 선택
  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
  };

  // AI 분석 태스크 제출
  const handleSubmitAnalysis = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setReport(null);
    setShareLinkInfo(null);
    setTaskStatus({
      status: "PENDING",
      progress_percent: 5,
      message: "비동기 분석 작업 큐에 요청을 등록하는 중...",
    });

    try {
      let uploadedFilename = null;
      if (imageFile) {
        const imgForm = new FormData();
        imgForm.append("file", imageFile);
        const upRes = await fetch(`${API_BASE}/api/v1/uploads/lesion-image`, {
          method: "POST",
          body: imgForm,
        });
        if (upRes.ok) {
          const upData = await upRes.json();
          uploadedFilename = upData.filename;
        }
      }

      const symptomList = symptoms
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const medList = medications
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const token = localStorage.getItem("mediguide_token");
      const headers = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch(`${API_BASE}/api/v1/analyze/async`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          body_part: bodyPart,
          symptoms: symptomList.length > 0 ? symptomList : ["국소 발진"],
          itch_score: Number(itchScore),
          pain_score: Number(painScore),
          current_medications: medList,
          allergies: selectedAllergies,
          underlying_conditions: selectedConditions,
          clinical_note: clinicalNote,
          image_filename: uploadedFilename,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "분석 요청 실패");
      setCurrentTaskId(data.task_id);
    } catch (err) {
      setIsSubmitting(false);
      setTaskStatus({
        status: "FAILED",
        progress_percent: 0,
        message: "요청 오류: " + err.message,
      });
    }
  };

  const toggleAllergy = (item) => {
    setSelectedAllergies((prev) =>
      prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item]
    );
  };

  const toggleCondition = (code) => {
    setSelectedConditions((prev) =>
      prev.includes(code) ? prev.filter((x) => x !== code) : [...prev, code]
    );
  };

  const activeScheduleCount = schedules.filter((s) => s.is_active).length;

  return (
    <div className="app-shell">
      {/* 실시간 복약·도포 알람 토스트 배너 */}
      {activeAlertBanner && (
        <div className="no-print" style={{ background: "#0d6efd", color: "#fff", padding: "0.75rem 1.25rem", display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: 600 }}>
          <span>{activeAlertBanner}</span>
          <button
            type="button"
            onClick={() => setActiveAlertBanner(null)}
            style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", borderRadius: "8px", padding: "0.3rem 0.7rem", cursor: "pointer" }}
          >
            확인 · 닫기
          </button>
        </div>
      )}

      {/* 상단 내비게이션 헤더 */}
      <header className="top-nav no-print">
        <div className="brand-box">
          <div className="brand-logo">🩺</div>
          <div>
            <h1 className="brand-title">MediGuide AI</h1>
            <p className="brand-sub">피부 병변 스크리닝 · 식약처 DUR · FTU 맞춤형 복약 가이드</p>
          </div>
        </div>

        <div className="nav-actions">
          <span className="header-live-widget badge-pill badge-info" style={{ whiteSpace: "nowrap" }}>
  🕒 {nowText}
</span>
          <div className="tab-group">
            <button
              type="button"
              className={`tab-btn ${activeTab === "analyze" ? "active" : ""}`}
              onClick={() => setActiveTab("analyze")}
            >
              🔍 AI 스크리닝 · 가이드
            </button>
            <button
              type="button"
              className={`tab-btn ${activeTab === "history" ? "active" : ""}`}
              onClick={() => setActiveTab("history")}
            >
              🗂️ 내 진단 히스토리
            </button>
          </div>

          {currentUser ? (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span className="badge-pill badge-info">👤 {currentUser.full_name}님</span>
              <button type="button" className="btn-outline" onClick={handleLogout}>
                로그아웃
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn-outline"
              onClick={() => {
                setAuthMode("login");
                setShowAuthModal(true);
              }}
            >
              🔑 로그인 / 환자 등록
            </button>
          )}
        </div>
      </header>

      {/* 회원가입 / 로그인 모달 */}
      {showAuthModal && (
        <div className="modal-backdrop no-print" onClick={() => setShowAuthModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h2 style={{ margin: 0, fontSize: "1.15rem" }}>
                {authMode === "login" ? "🔑 환자 계정 로그인" : "📝 새 환자 계정 등록"}
              </h2>
              <button type="button" className="btn-outline" onClick={() => setShowAuthModal(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleAuthSubmit}>
              {authMode === "register" && (
                <div className="form-group">
                  <label className="form-label">성명 (닉네임)</label>
                  <input
                    className="form-control"
                    type="text"
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
                  className="form-control"
                  type="email"
                  placeholder="patient@example.com"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">비밀번호</label>
                <input
                  className="form-control"
                  type="password"
                  placeholder="••••••••"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  required
                />
              </div>
              {authMode === "register" && (
                <label style={{ display: "flex", alignItems: "center", gap: "0.45rem", fontSize: "0.85rem", marginBottom: "1rem", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={authPregnant}
                    onChange={(e) => setAuthPregnant(e.target.checked)}
                  />
                  임신 중 또는 수유부입니다 (금기 약물 자동 필터링)
                </label>
              )}
              <button type="submit" className="btn-primary">
                {authMode === "login" ? "로그인하기" : "회원가입 완료"}
              </button>
            </form>
            <div style={{ marginTop: "0.85rem", textAlign: "center", fontSize: "0.82rem" }}>
              {authMode === "login" ? (
                <button
                  type="button"
                  style={{ background: "none", border: "none", color: "#0d6efd", cursor: "pointer", fontWeight: 600 }}
                  onClick={() => setAuthMode("register")}
                >
                  계정이 없으신가요? 회원가입
                </button>
              ) : (
                <button
                  type="button"
                  style={{ background: "none", border: "none", color: "#0d6efd", cursor: "pointer", fontWeight: 600 }}
                  onClick={() => setAuthMode("login")}
                >
                  이미 계정이 있으신가요? 로그인
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 과거 진단 히스토리 탭 */}
      {activeTab === "history" ? (
        <main style={{ maxWidth: "1040px", margin: "1.5rem auto", padding: "0 1.25rem" }}>
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <div>
                <h2 className="card-title" style={{ margin: 0 }}>🗂️ 과거 AI 피부 스크리닝 · 복약 가이드 이력</h2>
                <p className="form-hint">이력을 클릭하면 당시 Grad-CAM 히트맵, DUR 경고 및 맞춤형 복약 가이드를 즉시 다시 확인할 수 있습니다.</p>
              </div>
              <button type="button" className="btn-outline" onClick={fetchHistory}>
                🔄 새로고침
              </button>
            </div>

            {loadingHistory ? (
              <p className="form-hint">이력을 불러오는 중입니다...</p>
            ) : historyList.length === 0 ? (
              <div style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}>
                저장된 진단 기록이 없습니다. 먼저 AI 스크리닝을 실행해 주세요.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
                {historyList.map((item) => (
                  <div
                    key={item.record_id}
                    className="med-item"
                    style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                    onClick={() => handleSelectHistoryItem(item)}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <strong>{item.primary_disease_name || "분석 대기 중"}</strong>
                        <span className="badge-pill badge-info">{item.body_part}</span>
                        {item.triage_level && (
                          <span className={`badge-pill ${item.triage_level === "EMERGENCY_ER" ? "badge-danger" : "badge-warn"}`}>
                            {item.triage_level}
                          </span>
                        )}
                      </div>
                      <div className="form-hint" style={{ marginTop: "0.25rem" }}>
                        증상: {(item.symptoms || []).join(", ")} · 가려움 {item.itch_score}/10 · 통증 {item.pain_score}/10
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "0.78rem", color: "#64748b" }}>{item.created_at}</div>
                      <span style={{ fontSize: "0.8rem", color: "#0d6efd", fontWeight: 700 }}>리포트 열기 →</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      ) : (
        <>
          {/* 메인 2열 그리드 (좌측 문진 + 우측 상단 요약/히트맵) */}
          <main className="main-grid">
            {/* 좌측 열: 문진 폼 + 복약 알림 스케줄러 */}
            <div className="no-print">
              <section className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.8rem" }}>
                  <h2 className="card-title" style={{ margin: 0 }}>1. 피부 병변 문진</h2>
                  <button type="button" className="btn-outline" style={{ fontSize: "0.76rem", padding: "0.3rem 0.65rem" }} onClick={handleResetCase}>
                    🔄 다음 환자 초기화
                  </button>
                </div>

                <form onSubmit={handleSubmitAnalysis}>
                  <div className="form-group">
                    <label className="form-label">병변 발생 부위</label>
                    <select className="form-control" value={bodyPart} onChange={(e) => setBodyPart(e.target.value)}>
                      <option value="FACE">얼굴 (FACE) - 민감 부위</option>
                      <option value="NECK">목·귀 주변 (NECK)</option>
                      <option value="TRUNK">몸통·등·가슴 (TRUNK)</option>
                      <option value="UPPER_EXTREMITY">팔·손 (UPPER_EXTREMITY)</option>
                      <option value="LOWER_EXTREMITY">다리·발 (LOWER_EXTREMITY)</option>
                      <option value="INTERTRIGINUOUS">접히는 부위·사타구니·겨드랑이 (INTERTRIGINUOUS)</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">주요 자각 증상 (쉼표 구분)</label>
                    <input
                      className="form-control"
                      type="text"
                      placeholder="예: 붉은 반점, 각질, 가려움, 진물"
                      value={symptoms}
                      onChange={(e) => setSymptoms(e.target.value)}
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.85rem" }}>
                    <div>
                      <label className="form-label">가려움 지수: {itchScore}/10</label>
                      <input type="range" min="0" max="10" value={itchScore} onChange={(e) => setItchScore(e.target.value)} style={{ width: "100%" }} />
                    </div>
                    <div>
                      <label className="form-label">통증 지수: {painScore}/10</label>
                      <input type="range" min="0" max="10" value={painScore} onChange={(e) => setPainScore(e.target.value)} style={{ width: "100%" }} />
                    </div>
                  </div>

                  <div className="form-group">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.3rem" }}>
                      <label className="form-label" style={{ margin: 0 }}>처방/보유 의약품</label>
                      <button
                        type="button"
                        className="btn-outline"
                        style={{ fontSize: "0.74rem", padding: "0.22rem 0.55rem", color: "#0d6efd", borderColor: "#bfdbfe", background: "#eff6ff" }}
                        onClick={() => ocrInputRef.current?.click()}
                        disabled={ocrLoading}
                      >
                        {ocrLoading ? "⏳ OCR 판독 중..." : "📷 처방전 OCR 자동입력"}
                      </button>
                      <input
                        ref={ocrInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={handleOcrFileChange}
                      />
                    </div>
                    <input
                      className="form-control"
                      type="text"
                      placeholder="예: 리도멕스크림0.15%, 에바스텔정10mg"
                      value={medications}
                      onChange={(e) => setMedications(e.target.value)}
                    />
                    {/* 다빈도 피부과 처방약 원클릭 빠른 추가 칩 */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.45rem" }}>
                      {QUICK_MED_CHIPS.map((med) => {
                        const isSelected = medications
                          .split(",")
                          .map((s) => s.trim())
                          .includes(med);
                        return (
                          <button
                            key={med}
                            type="button"
                            onClick={() => handleQuickAddMedicationChip(med)}
                            style={{
                              border: isSelected ? "1px solid #0d6efd" : "1px solid #cbd5e1",
                              background: isSelected ? "#eff6ff" : "#f8fafc",
                              color: isSelected ? "#0d6efd" : "#475569",
                              borderRadius: "999px",
                              padding: "0.2rem 0.55rem",
                              fontSize: "0.72rem",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            {isSelected ? `✓ ${med}` : `+ ${med}`}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 선택형 알레르기·기저질환 아코디언 */}
                  <div className="form-group">
                    <button
                      type="button"
                      onClick={() => setShowExtraIntake(!showExtraIntake)}
                      style={{
                        width: "100%",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "0.4rem",
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: "10px",
                        padding: "0.52rem 0.75rem",
                        fontSize: "0.8rem",
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

                    {showExtraIntake && (
                      <div style={{ marginTop: "0.6rem", padding: "0.75rem", background: "#f8fafc", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                        <div style={{ fontSize: "0.78rem", fontWeight: 700, marginBottom: "0.35rem", color: "#475569" }}>약물 알레르기 이력</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.7rem" }}>
                          {ALLERGY_OPTIONS.map((item) => (
                            <label key={item} style={{ fontSize: "0.76rem", background: "#fff", border: "1px solid #cbd5e1", borderRadius: "8px", padding: "0.25rem 0.5rem", cursor: "pointer" }}>
                              <input
                                type="checkbox"
                                checked={selectedAllergies.includes(item)}
                                onChange={() => toggleAllergy(item)}
                                style={{ marginRight: "0.3rem" }}
                              />
                              {item}
                            </label>
                          ))}
                        </div>

                        <div style={{ fontSize: "0.78rem", fontWeight: 700, marginBottom: "0.35rem", color: "#475569" }}>기저질환 및 특수 상태</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.7rem" }}>
                          {CONDITION_OPTIONS.map((cond) => (
                            <label key={cond.code} style={{ fontSize: "0.76rem", background: "#fff", border: "1px solid #cbd5e1", borderRadius: "8px", padding: "0.25rem 0.5rem", cursor: "pointer" }}>
                              <input
                                type="checkbox"
                                checked={selectedConditions.includes(cond.code)}
                                onChange={() => toggleCondition(cond.code)}
                                style={{ marginRight: "0.3rem" }}
                              />
                              {cond.label}
                            </label>
                          ))}
                        </div>

                        <div style={{ fontSize: "0.78rem", fontWeight: 700, marginBottom: "0.3rem", color: "#475569" }}>추가 특이사항 메모</div>
                        <textarea
                          className="form-control"
                          rows={2}
                          placeholder="발병 시점, 악화 요인 등을 자유롭게 입력하세요."
                          value={clinicalNote}
                          onChange={(e) => setClinicalNote(e.target.value)}
                        />
                      </div>
                    )}
                  </div>

                  {/* 병변 사진 업로드 */}
                  <div className="form-group">
                    <label className="form-label">실제 병변 사진 파일 첨부</label>
                    <label className="upload-dropzone" style={{ display: "block" }}>
                      <div style={{ fontSize: "1.2rem", marginBottom: "0.2rem" }}>📷</div>
                      <div style={{ fontWeight: 700, color: "#0d6efd", fontSize: "0.84rem" }}>
                        {imageFile ? imageFile.name : "클릭하여 피부 병변 사진 선택 (JPG, PNG)"}
                      </div>
                      <div style={{ fontSize: "0.74rem", color: "#64748b", marginTop: "0.15rem" }}>
                        미첨부 시 입력된 증상·문진 데이터 기반으로 분석됩니다
                      </div>
                      <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleImageChange} />
                    </label>
                  </div>

                  <button type="submit" className="btn-primary" disabled={isSubmitting}>
                    {isSubmitting ? "⏳ AI 정밀 스크리닝 분석 중..." : "🔍 AI 스크리닝 및 복약 가이드 분석 시작"}
                  </button>
                </form>
              </section>

              {/* 좌측 하단 접이식 복약·도포 알림 스케줄러 */}
              <section className="card">
                <div
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                  onClick={() => setShowScheduler(!showScheduler)}
                >
                  <span style={{ fontWeight: 800, fontSize: "0.92rem" }}>
                    ⏰ 복약 · 도포 알림 스케줄러 ({activeScheduleCount}건)
                  </span>
                  <span style={{ fontSize: "0.8rem", color: "#0d6efd", fontWeight: 700 }}>
                    {showScheduler ? "▲ 접기" : "▼ 펼치기"}
                  </span>
                </div>

                {showScheduler && (
                  <div style={{ marginTop: "0.85rem" }}>
                    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.5rem" }}>
                      <button
                        type="button"
                        className="btn-outline"
                        style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
                        onClick={() => {
                          const msg = "⏰ [테스트] 리도멕스크림0.15% 도포 시간입니다. 보습제 도포 15분 후 얇게 펴 바르세요.";
                          setActiveAlertBanner(msg);
                          speakKoreanText(msg);
                        }}
                      >
                        🔔 알림·음성 테스트
                      </button>
                    </div>

                    <form onSubmit={handleAddSchedule} style={{ display: "flex", flexDirection: "column", gap: "0.45rem", marginBottom: "0.85rem" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "0.45rem" }}>
                        <input
                          className="form-control"
                          type="text"
                          placeholder="약품명"
                          value={newAlarmDrug}
                          onChange={(e) => setNewAlarmDrug(e.target.value)}
                          required
                        />
                        <input
                          className="form-control"
                          type="time"
                          value={newAlarmTime}
                          onChange={(e) => setNewAlarmTime(e.target.value)}
                          required
                        />
                      </div>
                      <input
                        className="form-control"
                        type="text"
                        placeholder="복약·도포 메모"
                        value={newAlarmNote}
                        onChange={(e) => setNewAlarmNote(e.target.value)}
                      />
                      <button type="submit" className="btn-outline" style={{ width: "100%", fontWeight: 700 }}>
                        + 새 복약 알림 등록
                      </button>
                    </form>

                    {schedules.length === 0 ? (
                      <div className="form-hint">등록된 복약 알림이 없습니다.</div>
                    ) : (
                      schedules.map((s) => (
                        <div
                          key={s.schedule_id}
                          className="med-item"
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: "0.5rem",
                            opacity: s.is_active ? 1 : 0.6,
                          }}
                        >
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
                  </div>
                )}
              </section>
            </div>

            {/* 우측 열: 진행률, 진료 준비 도구, DUR 경고, Grad-CAM 히트맵 */}
            <section>
              {taskStatus && (
                <div className="card no-print">
                  <div className="progress-header">
                    <strong>🔬 AI 비동기 분석 파이프라인</strong>
                    <span className="badge-pill badge-info">{taskStatus.status}</span>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${taskStatus.progress_percent || 0}%` }} />
                  </div>
                  <div className="form-hint" style={{ marginTop: "0.4rem" }}>{taskStatus.message}</div>
                </div>
              )}

              {!report && !isSubmitting && <MainWelcomePanel />}

              {report && (
                <>
                  {/* 인쇄 전용 진료 요약 헤더 */}
                  <div className="print-only" style={{ marginBottom: "1rem", borderBottom: "2px solid #0f172a", paddingBottom: "0.6rem" }}>
                    <h2 style={{ margin: 0, fontSize: "1.2rem" }}>🩺 MediGuide AI - 피부과 진료 참고용 요약 리포트</h2>
                    <div style={{ fontSize: "0.82rem", color: "#475569", marginTop: "0.25rem" }}>
                      환자명: {currentUser?.full_name || "게스트"} · 출력일시: {new Date().toLocaleString("ko-KR")} · 발생부위: {bodyPart} · 가려움: {itchScore}/10 · 통증: {painScore}/10
                    </div>
                  </div>

                  {/* 진료 준비 및 가족 공유 도구 모음 */}
                  <div className="card no-print">
                    <div style={{ fontWeight: 800, fontSize: "0.94rem", marginBottom: "0.2rem" }}>🏥 진료 준비 및 가족 공유 도구</div>
                    <div className="form-hint" style={{ marginBottom: "0.75rem" }}>
                      병원 진료 시 PDF로 출력해 보여주거나, 주변 피부과·약국 및 가족 공유 링크를 이용하세요.
                    </div>
                    <div className="action-toolbar">
                      <button type="button" className="tool-btn tool-btn-blue" onClick={() => window.print()}>
                        🖨️ 진료용 PDF / 인쇄
                      </button>
                      <a
                        className="tool-btn tool-btn-teal"
                        href="https://map.naver.com/p/search/피부과"
                        target="_blank"
                        rel="noreferrer"
                      >
                        🏥 주변 피부과
                      </a>
                      <a
                        className="tool-btn tool-btn-pink"
                        href="https://map.naver.com/p/search/약국"
                        target="_blank"
                        rel="noreferrer"
                      >
                        💊 주변 약국
                      </a>
                      <button type="button" className="tool-btn tool-btn-dark" onClick={handleCreateShareLink}>
                        🔗 가족 공유 링크
                      </button>
                    </div>

                    {shareLinkInfo && (
                      <div style={{ marginTop: "0.75rem", padding: "0.65rem 0.85rem", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "10px", fontSize: "0.82rem" }}>
                        <strong style={{ color: "#15803d" }}>✅ 보호자 안심 공유 링크가 클립보드에 복사되었습니다!</strong>
                        <div style={{ marginTop: "0.25rem", wordBreak: "break-all", color: "#334155" }}>{shareLinkInfo.share_url}</div>
                      </div>
                    )}
                  </div>

                  {/* 응급 트리아제 & 개인화 알레르기/임부 DUR 배너 */}
                  <EmergencyTriageBanner triage={report.triage} />
                  <PersonalDurBanner
                    personalAlerts={report.guide?.personal_safety_alerts}
                    duplicateAlerts={report.guide?.duplicate_therapy_alerts}
                  />

                  {/* 처방약 개별 DUR 금기 배너 */}
                  {(report.guide?.dur_warnings || []).map((warn, i) => (
                    <div key={i} className="alert-box alert-danger">
                      <div className="alert-title">🚨 [DUR 안전 경고 - {warn.drug_name}]</div>
                      <div style={{ fontSize: "0.86rem" }}>{warn.warning_message}</div>
                    </div>
                  ))}

                  {/* 2. AI 병변 스크리닝 & Grad-CAM 히트맵 */}
                  <div className="card">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem" }}>
                      <h2 className="card-title" style={{ margin: 0 }}>2. AI 병변 스크리닝 & Grad-CAM 히트맵</h2>
                      <span className={`badge-pill ${report.triage?.triage_level === "EMERGENCY_ER" ? "badge-danger" : "badge-info"}`}>
                        {report.triage?.triage_level || "ROUTINE_OUTPATIENT"}
                      </span>
                    </div>

                    <div className="screening-grid">
                      <div>
                        <div className="gradcam-frame">
                          {imagePreviewUrl ? (
                            <img src={imagePreviewUrl} alt="병변 원본" className="gradcam-base" />
                          ) : (
                            <div className="gradcam-base" style={{ background: "radial-gradient(circle at 50% 45%, #f1b5b5 0%, #e2a4a4 55%, #d69898 100%)" }} />
                          )}
                          {report.screening?.gradcam_overlay_base64 && (
                            <img
                              src={`data:image/png;base64,${report.screening.gradcam_overlay_base64}`}
                              alt="Grad-CAM 히트맵"
                              className="gradcam-overlay"
                              style={{ opacity: heatmapOpacity }}
                            />
                          )}
                        </div>
                        <div style={{ marginTop: "0.55rem", textAlign: "center" }}>
                          <label className="form-label" style={{ fontSize: "0.78rem" }}>
                            히트맵 투명도 조절: {Math.round(heatmapOpacity * 100)}%
                          </label>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={heatmapOpacity}
                            onChange={(e) => setHeatmapOpacity(Number(e.target.value))}
                            style={{ width: "85%" }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="disease-highlight">
                          <div className="form-hint">1순위 예측 질환</div>
                          <h3 className="disease-name">
                    {(() => {
                      const rawProb =
                        typeof report.screening?.primary_confidence === "number"
                          ? report.screening.primary_confidence
                          : report.screening?.top3_candidates && report.screening.top3_candidates[0]
                            ? report.screening.top3_candidates[0].probability
                            : null;
                      const pctText =
                        typeof rawProb === "number" && !Number.isNaN(rawProb)
                          ? `${(rawProb * 100).toFixed(1)}%`
                          : null;
                      return `${report.screening.primary_disease_name}${pctText ? ` (${pctText})` : ""}`;
                    })()}
                  </h3>
                          <div style={{ fontSize: "0.86rem", color: "#475569" }}>{report.screening.visual_findings_summary}</div>
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

          {/* 3. 전체 폭 맞춤형 FTU 정량 도포 및 복약 가이드 (하단 풀폭 카드) */}
          {report && (
            <>
              <div className="report-bottom-wrap" style={{ maxWidth: "1280px", margin: "1.25rem auto 0 auto", padding: "0 1.25rem" }}>
                <div className="card" style={{ margin: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.85rem" }}>
                    <h2 className="card-title" style={{ margin: 0 }}>3. 맞춤형 FTU 정량 도포 및 복약 가이드</h2>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#0369a1", background: "#e0f2fe", border: "1px solid #bae6fd", borderRadius: "999px", padding: "0.26rem 0.72rem" }}>
                      식약처 e약은요 · 심평원 DUR 검증
                    </span>
                  </div>

                  <div className="ftu-box">
                    <strong>
                      📏 권장 도포량 ({report.guide.ftu_dosage_guide.body_part_label}): {report.guide.ftu_dosage_guide.recommended_ftu} FTU
  {typeof report.guide.ftu_dosage_guide.estimated_grams === "number"
    ? ` (${report.guide.ftu_dosage_guide.estimated_grams}g)`
    : ""}
                    </strong>
                    <div style={{ marginTop: "0.25rem" }}>{report.guide.ftu_dosage_guide.instruction}</div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "0.9rem" }}>
                    {report.guide.medication_guide.map((m, idx) => {
                      const { gradeBadge, lines } = parseMedicationSummary(m.guidance_summary);
                      const isHighPotency = gradeBadge.includes("1등급") || gradeBadge.includes("초강력");
                      return (
                        <div key={idx} className="med-item" style={{ margin: 0, padding: "0.95rem 1.05rem" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.45rem", marginBottom: "0.45rem" }}>
                            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "0.45rem" }}>
                              <strong style={{ fontSize: "0.98rem", color: "#0f172a" }}>💊 {m.drug_name}</strong>
                              {gradeBadge && (
                                <span
                                  style={{
                                    fontSize: "0.73rem",
                                    fontWeight: 700,
                                    padding: "0.18rem 0.55rem",
                                    borderRadius: "999px",
                                    background: isHighPotency ? "#fee2e2" : "#e0f2fe",
                                    color: isHighPotency ? "#b91c1c" : "#0369a1",
                                    border: isHighPotency ? "1px solid #fecaca" : "1px solid #bae6fd",
                                  }}
                                >
                                  {gradeBadge}
                                </span>
                              )}
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                              <span style={{ fontSize: "0.75rem", color: "#475569", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "0.2rem 0.55rem" }}>
                                성분: {m.ingredient}
                              </span>
                              <button
                                type="button"
                                className="no-print"
                                onClick={() => handleQuickAddSchedule(m.drug_name, lines[1]?.value || lines[0]?.value)}
                                style={{
                                  border: "1px solid #bae6fd",
                                  background: "#f0f9ff",
                                  color: "#0369a1",
                                  borderRadius: "6px",
                                  padding: "0.2rem 0.55rem",
                                  fontSize: "0.75rem",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                }}
                              >
                                {schedules.some((s) => s.drug_name === m.drug_name) ? "✓ 스케줄 등록됨" : "⏰ + 알림 등록"}
                              </button>
                            </div>
                          </div>

                          <ul style={{ margin: 0, paddingLeft: "1.1rem", display: "flex", flexDirection: "column", gap: "0.26rem", fontSize: "0.84rem", color: "#334155", lineHeight: 1.55 }}>
                            {lines.map((line, lIdx) => (
                              <li key={lIdx}>
                                {line.label && <strong style={{ color: "#0f172a" }}>{line.label}: </strong>}
                                <span>{line.value}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>

                  <ClinicalGuideCard
                    lifestyleAdvice={report.guide.lifestyle_advice}
                    doctorQuestions={report.guide.doctor_questions}
                    ragReferences={report.guide.rag_references}
                  />
                </div>

                {/* 의학적 면책 조항 배너 */}
                <div style={{ marginTop: "0.9rem", padding: "0.75rem 1rem", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: "10px", fontSize: "0.78rem", color: "#64748b" }}>
                  ※ 본 결과는 AI 분석에 기반한 참고용 정보이며, 의사의 전문적인 의학적 진단을 대체할 수 없습니다.
                </div>
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
