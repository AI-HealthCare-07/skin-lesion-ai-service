export function speakKoreanText(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ko-KR";
  utterance.rate = 0.96;
  utterance.pitch = 1.05;
  window.speechSynthesis.speak(utterance);
}

export async function triggerMedicationAlert(drugName, dosageNote, ttsEnabled = true) {
  const title = `⏰ [복약·도포 알림] ${drugName}`;
  const bodyText = `${drugName} 사용 시간입니다. ${dosageNote || "정량을 지켜 사용해 주세요."}`;

  if (ttsEnabled) {
    speakKoreanText(`메디가이드 복약 알림입니다. ${bodyText}`);
  }

  if ("Notification" in window) {
    if (Notification.permission === "granted") {
      new Notification(title, { body: bodyText });
    } else if (Notification.permission !== "denied") {
      const perm = await Notification.requestPermission();
      if (perm === "granted") {
        new Notification(title, { body: bodyText });
      }
    }
  }

  return {
    title,
    bodyText,
    time: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }),
  };
}

export function parseMedicationSummary(summaryText) {
  if (!summaryText || typeof summaryText !== "string") {
    return { gradeBadge: "", lines: [] };
  }

  const parts = summaryText
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean);

  let gradeBadge = "";
  const bodyParts = [];

  for (const part of parts) {
    if (!gradeBadge && /(스테로이드|항히스타민|등급|강력|약함)/.test(part) && part.length <= 28) {
      gradeBadge = part.replace(/^\[|\]$/g, "").trim();
    } else {
      bodyParts.push(part);
    }
  }

  const lines = bodyParts.map((part) => {
    const colonIdx = part.indexOf(":");
    if (colonIdx > 0 && colonIdx < 16) {
      return {
        label: part.slice(0, colonIdx).trim(),
        value: part.slice(colonIdx + 1).trim(),
      };
    }
    return { label: "", value: part };
  });

  return { gradeBadge, lines };
}