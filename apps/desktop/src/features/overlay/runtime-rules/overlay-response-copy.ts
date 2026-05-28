import type { RealtimeActionName, RealtimeConversationMode } from "./realtime-action-types.js";

export type RuntimeKeywordStatus = "idle" | "loading" | "ready" | "empty" | "error";

export type HelpResponse = {
  title: string;
  points: string[];
  kind: "help" | "notice";
};

type RealtimeResponseFormatOptions = {
  action?: RealtimeActionName;
  conversationMode?: RealtimeConversationMode;
  sourceText?: string;
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

  return `Chips muncul saat topik lawan bicara relevan dengan ${context.domainLabel || "konteks meeting"}.`;
}

export function buildNoFreshContextResponse(): HelpResponse {
  return {
    title: "Konteks Belum Tertangkap",
    kind: "notice",
    points: [
      "Konteks percakapan yang stabil belum tertangkap.",
      "Tunggu transcript lawan bicara muncul, lalu klik bantuan lagi.",
      "Jika lawan bicara baru mulai bicara, saya menunggu transcript baru sebelum memberi bantuan."
    ]
  };
}

export function buildNoKeywordResponse(): HelpResponse {
  return {
    title: "Keyword Belum Ada",
    kind: "notice",
    points: [
      "Belum ada keyword spesifik yang bisa dijelaskan dari konteks terbaru.",
      "Kalau butuh bantuan sekarang, pakai Jawab Pertanyaan, Tanggapi, Pertanyaan Follow-up, Jelaskan Maksudnya, atau tulis pertanyaan manual di Ask.",
      "Saya tidak akan membuat keyword dummy karena bisa menyesatkan saat meeting."
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
      "Tidak ada fallback diam-diam ke gpt-5-mini untuk tombol live meeting."
    ]
  };
}

export function formatRealtimeResponsePoints(text: string, options: RealtimeResponseFormatOptions = {}) {
  const cleaned = text.trim();
  if (!cleaned) {
    return [];
  }

  const linePoints = cleaned
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:[-*\u2022]|\u00e2\u20ac\u00a2)\s*/, "").trim())
    .map((line) => stripRealtimeTriggerPrefix(line))
    .map((line) => sanitizeRealtimeResponsePoint(line, options))
    .filter(Boolean)
    .slice(0, 6);

  if (linePoints.length > 1 || cleaned.length < 160) {
    return linePoints;
  }

  return splitLongRealtimeParagraph(linePoints[0] || cleaned)
    .map((line) => sanitizeRealtimeResponsePoint(line, options))
    .filter(Boolean);
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

function sanitizeRealtimeResponsePoint(point: string, options: RealtimeResponseFormatOptions) {
  const isQnaAnswer = options.action === "answer_qna" || (options.action === "answer" && options.conversationMode === "qna");
  if (isQnaAnswer && isQnaMetaIntro(point)) {
    return sanitizeQnaMetaIntro(point);
  }

  const isConvoAnswer = options.action === "answer_convo" || (options.action === "answer" && options.conversationMode === "convo");
  if (!isConvoAnswer) {
    return point;
  }

  let sanitized = point
    .replace(/^Mungkin\s+ada\s+baiknya\s+/i, "Kita bisa ")
    .replace(/^Ada\s+baiknya\s+/i, "Kita bisa ")
    .replace(/^Mungkin\s+kita\s+bisa\s+/i, "Kita bisa ")
    .replace(/^Mungkin\s+/i, "")
    .replace(/^Langkah\s+(?:berikutnya|selanjutnya)(?:\s+adalah|:)?\s*(?:kita\s+bisa\s+)?/i, "Kita bisa ")
    .replace(/^Langkah\s+lain(?:\s+yang\s+bisa\s+dicoba)?(?:\s+adalah|:)?\s*(?:kita\s+bisa\s+)?/i, "Kita bisa ")
    .replace(/^Hal\s+yang\s+bisa\s+dicoba(?:\s+adalah|:)?\s*/i, "Kita bisa ")
    .replace(/\b(melihat|cek|memeriksa|mengevaluasi)\s+apakah\b/gi, "$1")
    .replace(/\bapakah\b/gi, "");

  return capitalizeFirstLetter(sanitized.replace(/\s{2,}/g, " ").trim());
}

function capitalizeFirstLetter(text: string) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function stripRealtimeTriggerPrefix(line: string) {
  return line
    .replace(/^(?:BANTU_[A-Z_]+|JAWAB_PERTANYAAN|TANGGAPI|BANTU_FOLLOWUP|JELASKAN_MAKSUDNYA|EXPLAIN_KEYWORD|ASK):\s*/i, "")
    .trim();
}

function isQnaMetaIntro(point: string) {
  return /^(?:berikut(?:\s+(?:adalah|ini|penjelasan|jawaban|poin(?:-poin)?|beberapa))?|ini\s+(?:adalah|jawabannya|penjelasannya)|poin(?:-poin)?(?:nya)?|saya\s+akan|jawabannya\s+adalah)\b/i.test(point.trim());
}

function sanitizeQnaMetaIntro(point: string) {
  const trimmed = point.trim();
  const colonIndex = trimmed.indexOf(":");
  if (colonIndex < 0 || colonIndex === trimmed.length - 1) {
    return "";
  }

  return capitalizeFirstLetter(trimmed.slice(colonIndex + 1).trim());
}
