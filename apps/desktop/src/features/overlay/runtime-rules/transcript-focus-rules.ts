import type { RealtimeContext } from "@interview-app/shared";

export type TranscriptFocusContext = {
  domainLabel?: string;
  realtimeContext?: RealtimeContext;
};

export type TranscriptQualityStatus = "accept" | "reject" | "quarantine";

export type TranscriptQualityResult = {
  status: TranscriptQualityStatus;
  reason?: string;
};

export type ConversationMode = "qna" | "convo" | "unknown";

const waitingQuestionPrefix = "Menunggu konteks percakapan";
const genericAdNoiseSignals = [
  "sponsored",
  "apply now",
  "skip ad",
  "lewati iklan",
  "free trial",
  "limited offer",
  "promo code",
  "sign up today",
  "download now",
  "subscribe now",
  "start your free",
  "claim your",
  "learn more at"
];

const assistantAddressingSignals = [
  "chatgpt",
  "chat gpt",
  "assistant",
  "asisten",
  "ai assistant"
];

const promptInstructionSignals = [
  "jawab sebagai",
  "jawablah sebagai",
  "jawab pertanyaan ini",
  "coba jawab",
  "sebagai kandidat",
  "sebagai chatgpt",
  "as chatgpt",
  "answer as",
  "respond as",
  "ignore previous",
  "abaikan instruksi",
  "system prompt",
  "developer message",
  "ikuti instruksi",
  "gunakan format"
];

const uiOrDebugSignals = [
  "latest conversation focus",
  "runtime keyword chips",
  "bantu jawab",
  "bantu follow-up",
  "jelaskan maksudnya",
  "konteks belum tertangkap",
  "mencari keyword",
  "keyword belum berhasil",
  "realtime session",
  "gpt-realtime",
  "gpt-4o-mini-transcribe"
];

const transcriptionPromptArtifactSignals = [
  "audio meeting online berbahasa indonesia",
  "istilah teknis",
  "nama tools",
  "nama produk",
  "metode kerja",
  "nama orang",
  "topik domain",
  "bisa bercampur inggris",
  "pertahankan bahasa asli"
];

const broadMeetingSignals = [
  "action", "agenda", "analisis", "analysis", "approach", "assessment", "background", "blocker",
  "challenge", "collaboration", "communication", "compliance", "conflict", "constraint", "context",
  "decision", "delivery", "dampak", "data", "discussion", "education", "evaluasi", "example",
  "feedback", "goal", "impact", "initiative", "issue", "kebutuhan", "kepatuhan", "kualitas",
  "metric", "metode", "next step", "objective", "operation", "operasional", "ownership",
  "pendekatan", "pengalaman", "planning", "policy", "priority", "prioritas", "problem", "process",
  "proses", "progress", "project", "quality", "requirement", "responsibility", "risk", "risiko",
  "scope", "standard", "stakeholder", "status", "target", "tantangan", "task", "timeline",
  "trade-off", "tradeoff", "update", "workflow"
];

const responseNeededSignals = [
  "menurut kamu", "menurutmu", "pendapat kamu", "pendapatmu", "apa pendapat", "what do you think",
  "do you think", "gimana menurut", "bagaimana menurut", "tolong jelaskan", "coba jelaskan",
  "bisa jelaskan", "bisa cerita", "ceritakan", "jelaskan", "explain", "tell me", "walk me through",
  "harus bagaimana", "perlu bagaimana", "sebaiknya", "should we", "which one", "mana yang",
  "pilih", "compare", "bandingkan", "setuju", "agree", "klarifikasi", "clarify"
];

const conversationalStatementSignals = [
  "saya pikir", "aku pikir", "menurut saya", "menurutku", "kami merasa", "kita merasa",
  "masalahnya", "concern", "kekhawatiran", "ragu", "feedback", "update", "progress",
  "diskusi", "menarik", "interesting",
  "kelihatannya", "sepertinya", "ternyata", "kami sedang", "kita sedang", "mereka sedang",
  "sudah", "belum", "agak", "cukup", "terlalu", "makin", "semakin"
];

export function buildConversationWindow(turns: Array<{ text: string }>) {
  const maxLength = 1800;
  const joined = turns
    .slice(-10)
    .map((turn) => turn.text)
    .filter(Boolean)
    .join("\n")
    .trim();

  if (joined.length <= maxLength) {
    return joined;
  }

  return joined.slice(joined.length - maxLength).trim();
}

export function buildKeywordSourceText(latestQuestion: string, recentTranscript: string) {
  const normalizedQuestion = latestQuestion.trim();
  const transcriptSegments = recentTranscript
    .split(/\n+/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .slice(-4);
  const parts = [...transcriptSegments, normalizedQuestion].filter(Boolean);
  return Array.from(new Set(parts)).join("\n").trim();
}

export function deriveLatestConversationFocus(windowText: string, latestSegment: string, context: TranscriptFocusContext) {
  const questionLikeFocus = deriveContextFromTranscriptWindow(windowText, latestSegment, context);
  if (questionLikeFocus) {
    return questionLikeFocus;
  }

  const source = latestSegment.trim() || windowText.trim();
  if (!source || classifyTranscriptQuality(source).status !== "accept") {
    return "";
  }

  const segments = source
    .split(/[\n\r]+|(?<=[?.!])\s+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment && classifyTranscriptQuality(segment).status === "accept");
  const meaningful = [...segments].reverse().find((segment) => segment.length >= 12);
  return meaningful ? compactFocusText(meaningful) : "";
}

export function chooseMostCompleteTranscript(finalText: string, ...candidates: Array<string | undefined>): string {
  const normalizedFinal = normalizeTranscriptText(finalText);
  return candidates.reduce<string>((best, candidate) => {
    const normalizedCandidate = normalizeTranscriptText(candidate || "");
    if (!normalizedCandidate || isLikelyTranscriptNoise(normalizedCandidate)) {
      return best;
    }

    return isMoreCompleteTranscript(normalizedCandidate, best) ? normalizedCandidate : best;
  }, normalizedFinal);
}

export function looksLikeInterviewerQuestion(text: string) {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  const questionLead = /^(apa|apakah|bagaimana|kenapa|mengapa|kapan|di mana|seberapa|jelaskan|ceritakan|bandingkan|pilih|sebutkan|how|what|why|when|where|can|could|do|did|have|tell me|explain)\b/;
  if (questionLead.test(normalized)) {
    return true;
  }

  if (!normalized.includes("?")) {
    return false;
  }

  return /\b(apa|apakah|bagaimana|kenapa|mengapa|metode|cara|pilih|pakai|gunakan|jelaskan|ceritakan|why|how|what|explain|approach)\b/.test(normalized);
}

export function classifyMeetingConversationMode(text: string): ConversationMode {
  const normalized = text.trim().toLowerCase();
  if (!normalized || classifyTranscriptQuality(text).status !== "accept") {
    return "unknown";
  }

  if (looksLikeInterviewerQuestion(text) || includesAnySignal(normalized, responseNeededSignals)) {
    return "qna";
  }

  if (includesAnySignal(normalized, conversationalStatementSignals)) {
    return "convo";
  }

  if (normalized.length >= 32 && hasStrongMeetingSignal(normalized)) {
    return "convo";
  }

  return "unknown";
}

export function isDomainRelatedText(text: string, context: TranscriptFocusContext) {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  const domainTerms = [
    context.domainLabel,
    context.realtimeContext?.domainProfile.primaryDomain,
    context.realtimeContext?.domainProfile.nicheDescription,
    ...(context.realtimeContext?.domainProfile.seedConcepts || []),
    ...(context.realtimeContext?.domainProfile.inScopeConcepts || [])
  ];

  const normalizedTerms = domainTerms.flatMap((term) => {
    const normalizedTerm = term?.trim().toLowerCase();
    return normalizedTerm && normalizedTerm.length >= 4 ? [normalizedTerm] : [];
  });

  if (normalizedTerms.some((term) => normalized.includes(term))) {
    return true;
  }

  const textTokens = tokenizeText(normalized);
  return normalizedTerms.some((term) => hasMeaningfulDomainOverlap(term, textTokens));
}

export function isLikelyTranscriptNoise(text: string) {
  return classifyTranscriptQuality(text).status !== "accept";
}

export function classifyTranscriptQuality(text: string): TranscriptQualityResult {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return { status: "reject", reason: "empty" };
  }

  if (includesAnySignal(normalized, genericAdNoiseSignals) || /\b(ad|ads|advertisement|iklan|promo)\b/.test(normalized)) {
    return { status: "reject", reason: "ad_or_promo" };
  }

  if (includesAnySignal(normalized, uiOrDebugSignals) || includesAnySignal(normalized, transcriptionPromptArtifactSignals)) {
    return { status: "reject", reason: "ui_or_debug_text" };
  }

  if (isAssistantAddressedText(normalized)) {
    return { status: "quarantine", reason: "assistant_addressing" };
  }

  if (includesAnySignal(normalized, promptInstructionSignals)) {
    return { status: "quarantine", reason: "prompt_instruction" };
  }

  return { status: "accept" };
}

export function areSameTranscript(left: string, right: string) {
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);
  return Boolean(normalizedLeft && normalizedRight)
    && (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft));
}

function compactFocusText(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 220) {
    return normalized;
  }

  return normalized.slice(normalized.length - 220).trim();
}

function isMoreCompleteTranscript(candidate: string, current: string) {
  if (!current) {
    return true;
  }

  if (areSameTranscript(candidate, current)) {
    return wordCount(candidate) > wordCount(current) || candidate.length > current.length + 20;
  }

  const candidateWords = wordCount(candidate);
  const currentWords = wordCount(current);
  return candidateWords >= currentWords + 4 && candidate.length >= current.length + 24;
}

function normalizeTranscriptText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function wordCount(value: string) {
  return tokenizeText(value).size;
}

function isDetectedQuestion(question: string) {
  const normalized = question.trim();
  return Boolean(normalized) && !normalized.startsWith(waitingQuestionPrefix);
}

function isConfirmedInterviewQuestion(text: string, context: TranscriptFocusContext) {
  const normalized = text.trim();
  const normalizedLower = normalized.toLowerCase();
  if (!isDetectedQuestion(normalized) || isLikelyTranscriptNoise(normalized)) {
    return false;
  }

  if (normalized.length < 18) {
    return false;
  }

  const narrativeOnlySignals = [
    "nanti gue",
    "gue akan kasih tunjuk",
    "akan kasih tunjuk",
    "lihat ya",
    "coba lihat",
    "hasil kerjaan dia",
    "seperti apa. kenapa"
  ];
  if (narrativeOnlySignals.some((signal) => normalizedLower.includes(signal)) && !hasStrongMeetingSignal(normalizedLower)) {
    return false;
  }

  if (looksLikeInterviewerQuestion(normalized)) {
    return isRelevantTranscriptText(normalized, context) || hasStrongMeetingSignal(normalizedLower);
  }

  return normalized.length >= 48 && hasStrongMeetingSignal(normalizedLower) && isRelevantTranscriptText(normalized, context);
}

function hasStrongMeetingSignal(normalizedLower: string) {
  return includesAnySignal(normalizedLower, broadMeetingSignals);
}

function deriveQuestionFromTranscriptText(transcriptText: string, context: TranscriptFocusContext) {
  const segments = transcriptText
    .split(/[\n\r]+|(?<=[?.!])\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    if (segment && isConfirmedInterviewQuestion(segment, context)) {
      return segment;
    }
  }

  const trailingSegment = segments.at(-1) || transcriptText;
  if (isConfirmedInterviewQuestion(trailingSegment, context)) {
    return trailingSegment;
  }

  return undefined;
}

function deriveContextFromTranscriptWindow(recentTranscript: string, latestSegment: string, context: TranscriptFocusContext) {
  const directQuestion = deriveQuestionFromTranscriptText(latestSegment, context);
  if (directQuestion && directQuestion.length >= 48 && isConfirmedInterviewQuestion(directQuestion, context)) {
    return directQuestion;
  }

  const windowText = recentTranscript.trim();
  if (!windowText) {
    return directQuestion && isConfirmedInterviewQuestion(directQuestion, context) ? directQuestion : "";
  }

  const segments = windowText
    .split(/[\n\r]+|(?<=[?.!])\s+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment && isRelevantTranscriptText(segment, context));
  const focusedWindow = segments.slice(-4).join(" ").trim();

  const combinedQuestion = directQuestion && focusedWindow && !focusedWindow.includes(directQuestion)
    ? `${focusedWindow} ${directQuestion}`.trim()
    : focusedWindow || directQuestion || "";

  if (combinedQuestion && isConfirmedInterviewQuestion(combinedQuestion, context)) {
    return combinedQuestion;
  }

  return directQuestion && isConfirmedInterviewQuestion(directQuestion, context) ? directQuestion : "";
}

function isRelevantTranscriptText(text: string, context: TranscriptFocusContext) {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (classifyTranscriptQuality(text).status !== "accept") {
    return false;
  }

  if (isDomainRelatedText(text, context)) {
    return true;
  }

  return includesAnySignal(normalized, [
    ...broadMeetingSignals,
    "apa yang", "bagaimana", "ceritakan", "explain", "jelaskan", "kenapa", "mengapa", "tell me",
    "how would", "why would"
  ]);
}

function isAssistantAddressedText(normalized: string) {
  const startsWithAssistantAddress = new RegExp(`^\\s*(?:${assistantAddressingSignals.map(escapeRegExp).join("|")})\\b[\\s,:-]*`).test(normalized);
  if (startsWithAssistantAddress) {
    return true;
  }

  return assistantAddressingSignals.some((signal) => {
    const escaped = escapeRegExp(signal);
    return new RegExp(`\\b${escaped}\\b[^.!?]{0,80}\\b(?:apa|apakah|bagaimana|jawab|answer|respond|kandidat|candidate)\\b`).test(normalized);
  });
}

function includesAnySignal(text: string, signals: string[]) {
  return signals.some((signal) => {
    const normalizedSignal = signal.trim().toLowerCase();
    if (!normalizedSignal) {
      return false;
    }

    if (/\s/.test(normalizedSignal)) {
      return text.includes(normalizedSignal);
    }

    return new RegExp(`\\b${escapeRegExp(normalizedSignal)}\\b`).test(text);
  });
}

function hasMeaningfulDomainOverlap(domainTerm: string, textTokens: Set<string>) {
  const termTokens = [...tokenizeText(domainTerm)]
    .filter((token) => token.length >= 4 && !isOverlyGenericDomainToken(token));
  if (!termTokens.length) {
    return false;
  }

  const matchedTokens = termTokens.filter((token) => textTokens.has(token));
  return termTokens.length === 1 ? matchedTokens.length === 1 : matchedTokens.length >= 2;
}

function isOverlyGenericDomainToken(token: string) {
  return new Set([
    "role", "posisi", "domain", "application", "interview", "kerja", "pekerjaan", "staff", "team",
    "tim", "company", "perusahaan", "candidate", "kandidat"
  ]).has(token);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenizeText(text: string) {
  const stopwords = new Set([
    "yang", "dan", "atau", "untuk", "dengan", "dari", "pada", "dalam", "kamu", "saya", "apa", "apakah",
    "bagaimana", "kenapa", "mengapa", "bisa", "the", "and", "or", "for", "with", "from", "this", "that",
    "how", "what", "why", "can", "could", "would", "should", "jelaskan", "ceritakan", "menurut", "kalau",
    "jika", "saat", "itu", "ini", "nya", "paling", "cocok", "pilih", "memilih", "gunakan", "pakai",
    "terkait", "tentang", "about", "tell", "me", "please", "use", "using", "choose", "related",
    "nanti", "gue", "aku", "akan", "kasih", "tunjuk", "ya", "dia", "seperti", "kerjaan", "hasil",
    "lihat", "coba", "dong", "deh", "nih", "aja", "sih", "role", "domain", "application",
    "interview", "company", "candidate", "kandidat", "perusahaan", "pekerjaan", "kerja"
  ]);

  return new Set(text
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !stopwords.has(token)));
}
