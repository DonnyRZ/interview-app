export type RealtimeActionName =
  | "answer_qna"
  | "answer_convo"
  | "answer"
  | "followup"
  | "explain"
  | "explain_text"
  | "keyword";

export type RealtimeConversationMode = "qna" | "convo" | "unknown";

export type RealtimeActionPromptPayload = {
  action: RealtimeActionName | "surface_keywords";
  latestQuestion?: string;
  recentTranscript?: string;
  triggerText?: string;
  conversationMode?: RealtimeConversationMode;
};

type RealtimeResponseFormatOptions = {
  action?: RealtimeActionName;
  conversationMode?: RealtimeConversationMode;
  sourceText?: string;
};

export type RealtimeResponseDoneStatus = "completed" | "cancelled" | "failed" | "incomplete" | "unknown";

export type RealtimeResponseDoneState = {
  status: RealtimeResponseDoneStatus;
  reason: string;
  errorCode: string;
  errorMessage: string;
};

export type RealtimeRateLimitState = {
  rateLimited: boolean;
  retryAfterMs: number;
};

export function isConversationHelpActionName(action: string) {
  return action === "answer_qna"
    || action === "answer_convo"
    || action === "answer"
    || action === "followup"
    || action === "explain"
    || action === "keyword";
}

export function getExplicitActionConversationMode(action: string): RealtimeConversationMode | undefined {
  if (action === "answer_qna") return "qna";
  if (action === "answer_convo") return "convo";
  return undefined;
}

export function buildRealtimeActionPrompt(payload: RealtimeActionPromptPayload) {
  const explanationSource = getExplanationSource(payload.action);
  return [
    `TRIGGER: ${getRealtimeTriggerName(payload)}`,
    explanationSource ? `EXPLANATION_SOURCE: ${explanationSource}` : "",
    "BEGIN_RUNTIME_DATA",
    payload.conversationMode ? `Conversation mode hint:\n${payload.conversationMode}` : "",
    payload.recentTranscript ? `Conversation window terbaru:\n${payload.recentTranscript}` : "",
    payload.latestQuestion ? `Latest conversation focus:\n${payload.latestQuestion}` : "",
    payload.action === "explain_text" && payload.triggerText
      ? `Explanation subject from user:\n${payload.triggerText}`
      : payload.triggerText ? `Input user/keyword:\n${payload.triggerText}` : "",
    "END_RUNTIME_DATA"
  ].filter(Boolean).join("\n");
}

export function getRealtimeActionTitle(payload: Pick<RealtimeActionPromptPayload, "action" | "triggerText">) {
  if (payload.action === "answer_qna" || payload.action === "answer") return "Jawab Pertanyaan";
  if (payload.action === "answer_convo") return "Tanggapi";
  if (payload.action === "followup") return "Pertanyaan Follow-up";
  if (payload.action === "explain") return "Jelaskan Maksudnya";
  if (payload.action === "keyword") return `Keyword: ${payload.triggerText || "Keyword"}`;
  if (payload.action === "surface_keywords") return "Runtime Keywords";
  return "Ask";
}

export function formatRealtimeResponsePoints(text: string, options: RealtimeResponseFormatOptions = {}) {
  const cleaned = text.trim();
  if (!cleaned) return [];

  const linePoints = cleaned
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:[-*\u2022]|\u00e2\u20ac\u00a2)\s*/, "").trim())
    .map((line) => stripRealtimeTriggerPrefix(line))
    .map((line) => sanitizeRealtimeResponsePoint(line, options))
    .filter(Boolean)
    .slice(0, 6);

  if (linePoints.length > 1 || cleaned.length < 160) return linePoints;

  return splitLongRealtimeParagraph(linePoints[0] || cleaned)
    .map((line) => sanitizeRealtimeResponsePoint(line, options))
    .filter(Boolean);
}

export function extractRealtimeResponseText(event: Record<string, unknown>) {
  const response = event.response && typeof event.response === "object"
    ? event.response as Record<string, unknown>
    : {};
  const output = Array.isArray(response.output) ? response.output : [];
  return output.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? (item as Record<string, unknown>).content as unknown[]
      : [];
    return content.flatMap((part) => {
      if (!part || typeof part !== "object") return [];
      const record = part as Record<string, unknown>;
      const text = typeof record.text === "string"
        ? record.text
        : typeof record.transcript === "string" ? record.transcript : "";
      return text ? [text] : [];
    });
  }).join("").trim();
}

export function getRealtimeResponseId(event: Record<string, unknown>) {
  if (typeof event.response_id === "string" && event.response_id.trim()) return event.response_id.trim();
  const response = event.response && typeof event.response === "object"
    ? event.response as Record<string, unknown>
    : null;
  return typeof response?.id === "string" && response.id.trim() ? response.id.trim() : "";
}

export function getRealtimeResponseDoneState(event: Record<string, unknown>): RealtimeResponseDoneState {
  const response = event.response && typeof event.response === "object"
    ? event.response as Record<string, unknown>
    : {};
  const rawStatus = typeof response.status === "string" ? response.status.trim().toLowerCase() : "";
  const status: RealtimeResponseDoneStatus = rawStatus === "completed"
    || rawStatus === "cancelled"
    || rawStatus === "failed"
    || rawStatus === "incomplete"
    ? rawStatus
    : "unknown";
  const details = response.status_details && typeof response.status_details === "object"
    ? response.status_details as Record<string, unknown>
    : {};
  const error = details.error && typeof details.error === "object"
    ? details.error as Record<string, unknown>
    : {};
  return {
    status,
    reason: typeof details.reason === "string" ? details.reason : "",
    errorCode: typeof error.code === "string" ? error.code : "",
    errorMessage: typeof error.message === "string" ? error.message : ""
  };
}

export function buildRealtimeCancelEvent(responseId?: string) {
  const normalized = responseId?.trim();
  return normalized ? { type: "response.cancel", response_id: normalized } : null;
}

export function isRecoverableRealtimeCancelError(message?: string) {
  return /cancellation failed:\s*no active response found/i.test(message || "");
}

export function getRealtimeRateLimitState(message?: string): RealtimeRateLimitState {
  const value = message || "";
  if (!/rate limit reached/i.test(value)) return { rateLimited: false, retryAfterMs: 0 };
  const retryMatch = value.match(/try again in\s+([\d.]+)\s*(ms|milliseconds?|s|sec|secs|seconds?)\b/i);
  if (!retryMatch) return { rateLimited: true, retryAfterMs: 1_000 };
  const amount = Number.parseFloat(retryMatch[1] || "");
  if (!Number.isFinite(amount) || amount <= 0) return { rateLimited: true, retryAfterMs: 1_000 };
  const unit = (retryMatch[2] || "").toLowerCase();
  return {
    rateLimited: true,
    retryAfterMs: unit.startsWith("m") ? Math.ceil(amount) : Math.ceil(amount * 1_000)
  };
}

export function parseRealtimeKeywords(text: string) {
  const line = text.split(/\r?\n/).find((item) => /^\s*KEYWORDS\s*:/i.test(item));
  if (!line) return [];
  return Array.from(new Set(
    line.replace(/^\s*KEYWORDS\s*:\s*/i, "")
      .split("|")
      .map((term) => term.trim())
      .filter(Boolean)
  )).slice(0, 3);
}

function getExplanationSource(action: RealtimeActionPromptPayload["action"]) {
  if (action === "explain_text") return "USER_TEXT";
  if (action === "explain") return "LATEST_TRANSCRIPT";
  return undefined;
}

function getRealtimeTriggerName(payload: RealtimeActionPromptPayload) {
  const action = payload.action;
  if (action === "answer_qna") return "JAWAB_PERTANYAAN";
  if (action === "answer_convo") return "TANGGAPI";
  if (action === "answer") return payload.conversationMode === "convo" ? "TANGGAPI" : "JAWAB_PERTANYAAN";
  if (action === "followup") return "BANTU_FOLLOWUP";
  if (action === "explain" || action === "explain_text") return "JELASKAN_MAKSUDNYA";
  if (action === "keyword") return "EXPLAIN_KEYWORD";
  if (action === "surface_keywords") return "SURFACE_KEYWORDS";
  const unsupportedAction: never = action;
  throw new Error(`Unsupported realtime action: ${String(unsupportedAction)}`);
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
  if (numberedPoints.length > 1) return numberedPoints.slice(0, 6);
  return normalized.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean).slice(0, 5);
}

function sanitizeRealtimeResponsePoint(point: string, options: RealtimeResponseFormatOptions) {
  const isQnaAnswer = options.action === "answer_qna"
    || (options.action === "answer" && options.conversationMode === "qna");
  if (isQnaAnswer) {
    const sanitizedQna = sanitizeQnaAnswerPoint(point);
    if (!sanitizedQna) return "";
    point = sanitizedQna;
  }

  const isConvoAnswer = options.action === "answer_convo"
    || (options.action === "answer" && options.conversationMode === "convo");
  if (!isConvoAnswer) return point;

  const sanitized = point
    .replace(/^Mungkin\s+ada\s+baiknya\s+/i, "Kita bisa ")
    .replace(/^Ada\s+baiknya\s+/i, "Kita bisa ")
    .replace(/^Mungkin\s+kita\s+bisa\s+/i, "Kita bisa ")
    .replace(/^Mungkin\s+/i, "")
    .replace(/^Langkah\s+(?:berikutnya|selanjutnya)(?:\s+adalah|:)?\s*(?:kita\s+bisa\s+)?/i, "Kita bisa ")
    .replace(/^Langkah\s+lain(?:\s+yang\s+bisa\s+dicoba)?(?:\s+adalah|:)?\s*(?:kita\s+bisa\s+)?/i, "Kita bisa ")
    .replace(/^Hal\s+yang\s+bisa\s+dicoba(?:\s+adalah|:)?\s*/i, "Kita bisa ")
    .replace(/\b(melihat|cek|memeriksa|mengevaluasi)\s+apakah\b/gi, "$1")
    .replace(/\bapakah\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return capitalizeFirstLetter(sanitized);
}

function capitalizeFirstLetter(text: string) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function stripRealtimeTriggerPrefix(line: string) {
  return line.replace(/^(?:BANTU_[A-Z_]+|JAWAB_PERTANYAAN|TANGGAPI|BANTU_FOLLOWUP|JELASKAN_MAKSUDNYA|EXPLAIN_KEYWORD):\s*/i, "").trim();
}

function isQnaMetaIntro(point: string) {
  return /^(?:berikut(?:\s+(?:adalah|ini|penjelasan|jawaban|poin(?:-poin)?|beberapa))?|ini\s+(?:adalah|jawabannya|penjelasannya)|poin(?:-poin)?(?:nya)?|saya\s+akan|jawabannya\s+adalah)\b/i.test(point.trim());
}

function sanitizeQnaMetaIntro(point: string) {
  const trimmed = point.trim();
  const colonIndex = trimmed.indexOf(":");
  if (colonIndex < 0 || colonIndex === trimmed.length - 1) return "";
  return capitalizeFirstLetter(trimmed.slice(colonIndex + 1).trim());
}

function sanitizeQnaAnswerPoint(point: string) {
  let sanitized = point.trim();
  sanitized = sanitized
    .replace(/^(?:tentu|baik|oke|ok|siap)[,.\s]+/i, "")
    .trim();

  if (isQnaMetaIntro(sanitized)) {
    return sanitizeQnaMetaIntro(sanitized);
  }

  const colonIndex = sanitized.indexOf(":");
  if (colonIndex > 0 && colonIndex < 120) {
    const leadIn = sanitized.slice(0, colonIndex).trim();
    const content = sanitized.slice(colonIndex + 1).trim();
    if (content && isMetaLeadIn(leadIn)) {
      return capitalizeFirstLetter(content);
    }
    if (!content && isMetaLeadIn(leadIn)) {
      return "";
    }
  }

  return sanitized;
}

function isMetaLeadIn(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  if (/\b(?:ai|assistant|asisten|chatgpt|model)\b/.test(normalized)) return true;
  if (/\b(?:pengalaman|jawaban|respons|respon|poin|template|contoh)\b/.test(normalized)) return true;
  if (/^(?:ini|berikut|jawabannya|sebagai|dalam konteks|untuk menjawab)\b/.test(normalized)) return true;
  return false;
}
