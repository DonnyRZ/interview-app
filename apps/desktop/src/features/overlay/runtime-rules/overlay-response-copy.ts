export type RuntimeKeywordStatus = "idle" | "loading" | "ready" | "empty" | "error";

export type HelpResponse = {
  title: string;
  points: string[];
  kind: "help" | "notice";
};

export function getRuntimeKeywordMessage(status: RuntimeKeywordStatus, context: { domainLabel?: string }) {
  if (status === "loading") {
    return "Mencari keyword relevan dari konteks terbaru...";
  }

  if (status === "error") {
    return "Keyword belum berhasil dibuat. Coba kirim transcript lagi.";
  }

  if (status === "empty") {
    return "Belum ada keyword yang cukup relevan dari konteks terbaru.";
  }

  return `Chips muncul saat topik interviewer relevan dengan ${context.domainLabel || "domain application"}.`;
}

export function buildNoFreshContextResponse(): HelpResponse {
  return {
    title: "Konteks Belum Tertangkap",
    kind: "notice",
    points: [
      "Konteks percakapan terbaru belum tertangkap.",
      "Tunggu lawan bicara selesai berbicara sebentar, lalu klik bantuan lagi.",
      "Saya tidak akan memakai konteks lama jika audio terbaru belum masuk."
    ]
  };
}

export function buildNoKeywordResponse(): HelpResponse {
  return {
    title: "Keyword Belum Ada",
    kind: "notice",
    points: [
      "Belum ada keyword spesifik yang bisa dijelaskan dari konteks terbaru.",
      "Kalau butuh bantuan sekarang, pakai Bantu Jawab, Bantu Follow-up, Jelaskan Maksudnya, atau tulis pertanyaan manual di Ask.",
      "Saya tidak akan membuat keyword dummy karena bisa menyesatkan saat interview."
    ]
  };
}

export function buildRealtimeUnavailableResponse(message?: string): HelpResponse {
  return {
    title: "Realtime Belum Aktif",
    kind: "notice",
    points: [
      message || "Realtime session belum aktif.",
      "Live help harus tersambung ke gpt-realtime-mini dulu.",
      "Tidak ada fallback diam-diam ke gpt-5-mini untuk tombol interview live."
    ]
  };
}

export function formatRealtimeResponsePoints(text: string) {
  const cleaned = text.trim();
  if (!cleaned) {
    return [];
  }

  const linePoints = cleaned
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:[-*\u2022]|\u00e2\u20ac\u00a2)\s*/, "").trim())
    .map((line) => line.replace(/^BANTU_[A-Z_]+:\s*/i, "").trim())
    .filter(Boolean)
    .slice(0, 6);

  if (linePoints.length > 1 || cleaned.length < 160) {
    return linePoints;
  }

  return splitLongRealtimeParagraph(linePoints[0] || cleaned);
}

export function extractRealtimeResponseText(event: Record<string, unknown>) {
  const response = event.response && typeof event.response === "object" ? event.response as Record<string, unknown> : {};
  const output = Array.isArray(response.output) ? response.output : [];
  return output.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const content = Array.isArray((item as Record<string, unknown>).content) ? (item as Record<string, unknown>).content as unknown[] : [];
    return content.flatMap((part) => {
      if (!part || typeof part !== "object") return [];
      const record = part as Record<string, unknown>;
      const text = typeof record.text === "string"
        ? record.text
        : typeof record.transcript === "string"
          ? record.transcript
          : "";
      return text ? [text] : [];
    });
  }).join("").trim();
}

function splitLongRealtimeParagraph(text: string) {
  const normalized = text
    .replace(/\s+(\d+[.)])\s+/g, "\n$1 ")
    .replace(/\s+(?:[-*\u2022]|\u00e2\u20ac\u00a2)\s+/g, "\n")
    .trim();

  const numberedPoints = normalized
    .split(/\n+|(?=\b\d+[.)]\s+)/)
    .map((line) => line.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean);

  if (numberedPoints.length > 1) {
    return numberedPoints.slice(0, 6);
  }

  return normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, 5);
}
