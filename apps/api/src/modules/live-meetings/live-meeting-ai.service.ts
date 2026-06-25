import type { RealtimeContext } from "@interview-app/shared";
import {
  surfaceRealtimeKeywordsResultSchema,
  generateMeetingExplanationResultSchema,
  generateMeetingKeywordHelpResultSchema,
  generateMeetingFollowupResultSchema,
  generateMeetingAnswerResultSchema,
  type SurfaceRealtimeKeywordsResult,
  type GenerateMeetingExplanationResult,
  type GenerateMeetingKeywordHelpResult,
  type GenerateMeetingFollowupResult,
  type GenerateMeetingAnswerResult
} from "../ai/action-schemas.js";
import { runOpenAiJsonAction } from "../ai/action-runner.js";
import {
  surfaceRealtimeKeywordsSpec,
  generateMeetingAnswerSpec,
  generateMeetingExplanationSpec,
  generateMeetingFollowupSpec,
  generateMeetingKeywordHelpSpec
} from "../ai/action-specs.js";

export type GenerateMeetingAnswerServiceInput = {
  userId?: string;
  meetingPrompt: string;
  realtimeContext: RealtimeContext;
};

export type GenerateMeetingFollowupServiceInput = GenerateMeetingAnswerServiceInput;
export type GenerateMeetingExplanationServiceInput = GenerateMeetingAnswerServiceInput;
export type GenerateMeetingKeywordHelpServiceInput = {
  userId?: string;
  keyword: string;
  meetingPrompt?: string;
  realtimeContext: RealtimeContext;
};
export type SurfaceRealtimeKeywordsServiceInput = {
  userId?: string;
  transcriptSegment: string;
  realtimeContext: RealtimeContext;
};

const realtimeKeywordTimeoutMs = 6_000;

export async function surfaceRealtimeKeywords(
  input: SurfaceRealtimeKeywordsServiceInput
): Promise<SurfaceRealtimeKeywordsResult> {
  const transcriptSegment = input.transcriptSegment.trim();

  if (!transcriptSegment) {
    return buildFallbackRealtimeKeywords("Transcript meeting kosong atau belum terdeteksi.");
  }

  try {
    const result = await withTimeout(runOpenAiJsonAction({
      spec: surfaceRealtimeKeywordsSpec,
      input: {
        transcriptSegment,
        realtimeContext: input.realtimeContext
      },
      outputSchema: surfaceRealtimeKeywordsResultSchema,
      userId: input.userId,
      usageCapability: "meeting_help"
    }), realtimeKeywordTimeoutMs);

    return normalizeRealtimeKeywords({
      ...result.output,
      warnings: [
        ...result.output.warnings,
        `AI metadata: ${result.metadata.actionId} ${result.metadata.promptVersion} using ${result.metadata.model}`
      ]
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown OpenAI realtime keyword error";
    console.warn(`[ai:fallback] surface_realtime_keywords failed: ${message}`);
    return buildFallbackRealtimeKeywords(message);
  }
}

export async function generateMeetingAnswer(
  input: GenerateMeetingAnswerServiceInput
): Promise<GenerateMeetingAnswerResult> {
  const normalizedQuestion = input.meetingPrompt.trim();

  if (!normalizedQuestion) {
    return buildFallbackMeetingAnswer(input, "Konteks meeting kosong atau belum terdeteksi.");
  }

  try {
    const result = await runOpenAiJsonAction({
      spec: generateMeetingAnswerSpec,
      input: {
        ...input,
        meetingPrompt: normalizedQuestion
      },
      outputSchema: generateMeetingAnswerResultSchema,
      userId: input.userId,
      usageCapability: "meeting_help"
    });

    return normalizeMeetingAnswer({
      ...result.output,
      warnings: [
        ...result.output.warnings,
        `AI metadata: ${result.metadata.actionId} ${result.metadata.promptVersion} using ${result.metadata.model}`
      ]
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown OpenAI meeting response error";
    console.warn(`[ai:fallback] generate_meeting_response failed: ${message}`);
    return buildFallbackMeetingAnswer(input, message);
  }
}

export async function generateMeetingExplanation(
  input: GenerateMeetingExplanationServiceInput
): Promise<GenerateMeetingExplanationResult> {
  const normalizedQuestion = input.meetingPrompt.trim();

  if (!normalizedQuestion) {
    return buildFallbackMeetingExplanation(input, "Konteks meeting kosong atau belum terdeteksi.");
  }

  try {
    const result = await runOpenAiJsonAction({
      spec: generateMeetingExplanationSpec,
      input: {
        ...input,
        meetingPrompt: normalizedQuestion
      },
      outputSchema: generateMeetingExplanationResultSchema,
      userId: input.userId,
      usageCapability: "meeting_help"
    });

    return normalizeMeetingExplanation({
      ...result.output,
      warnings: [
        ...result.output.warnings,
        `AI metadata: ${result.metadata.actionId} ${result.metadata.promptVersion} using ${result.metadata.model}`
      ]
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown OpenAI meeting explanation error";
    console.warn(`[ai:fallback] generate_meeting_explanation failed: ${message}`);
    return buildFallbackMeetingExplanation(input, message);
  }
}

export async function generateMeetingFollowup(
  input: GenerateMeetingFollowupServiceInput
): Promise<GenerateMeetingFollowupResult> {
  const normalizedQuestion = input.meetingPrompt.trim();

  if (!normalizedQuestion) {
    return buildFallbackMeetingFollowup(input, "Konteks meeting kosong atau belum terdeteksi.");
  }

  try {
    const result = await runOpenAiJsonAction({
      spec: generateMeetingFollowupSpec,
      input: {
        ...input,
        meetingPrompt: normalizedQuestion
      },
      outputSchema: generateMeetingFollowupResultSchema,
      userId: input.userId,
      usageCapability: "meeting_help"
    });

    return normalizeMeetingFollowup({
      ...result.output,
      warnings: [
        ...result.output.warnings,
        `AI metadata: ${result.metadata.actionId} ${result.metadata.promptVersion} using ${result.metadata.model}`
      ]
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown OpenAI meeting follow-up error";
    console.warn(`[ai:fallback] generate_meeting_followup failed: ${message}`);
    return buildFallbackMeetingFollowup(input, message);
  }
}

export async function generateMeetingKeywordHelp(
  input: GenerateMeetingKeywordHelpServiceInput
): Promise<GenerateMeetingKeywordHelpResult> {
  const normalizedKeyword = input.keyword.trim();

  if (!normalizedKeyword) {
    return buildFallbackMeetingKeywordHelp(input, "Keyword kosong atau belum tersedia.");
  }

  try {
    const result = await runOpenAiJsonAction({
      spec: generateMeetingKeywordHelpSpec,
      input: {
        ...input,
        keyword: normalizedKeyword
      },
      outputSchema: generateMeetingKeywordHelpResultSchema,
      userId: input.userId,
      usageCapability: "meeting_help"
    });

    return normalizeMeetingKeywordHelp({
      ...result.output,
      warnings: [
        ...result.output.warnings,
        `AI metadata: ${result.metadata.actionId} ${result.metadata.promptVersion} using ${result.metadata.model}`
      ]
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown OpenAI meeting keyword help error";
    console.warn(`[ai:fallback] generate_meeting_keyword_help failed: ${message}`);
    return buildFallbackMeetingKeywordHelp(input, message);
  }
}

function normalizeMeetingAnswer(result: GenerateMeetingAnswerResult): GenerateMeetingAnswerResult {
  return {
    ...result,
    result: {
      shouldAnswer: result.result.shouldAnswer,
      answerDraft: truncateText(result.result.answerDraft, 520),
      keyPoints: compactList(result.result.keyPoints, 3, 95),
      followUpNote: truncateText(result.result.followUpNote, 180)
    },
    warnings: compactList(result.warnings, 8, 220),
    missingInputs: compactList(result.missingInputs, 8, 120),
    evidence: result.evidence.slice(0, 5)
  };
}

function normalizeMeetingExplanation(result: GenerateMeetingExplanationResult): GenerateMeetingExplanationResult {
  return {
    ...result,
    result: {
      meaningSummary: truncateText(result.result.meaningSummary, 200),
      signals: compactList(result.result.signals, 3, 95),
      answerAngle: truncateText(result.result.answerAngle, 180)
    },
    warnings: compactList(result.warnings, 8, 220),
    missingInputs: compactList(result.missingInputs, 8, 120),
    evidence: result.evidence.slice(0, 5)
  };
}

function normalizeRealtimeKeywords(result: SurfaceRealtimeKeywordsResult): SurfaceRealtimeKeywordsResult {
  return {
    ...result,
    result: {
      shouldExpandOverlay: result.result.shouldExpandOverlay && result.result.keywords.length > 0,
      keywords: result.result.keywords.slice(0, 3).map((keyword) => ({
        term: truncateText(keyword.term, 36),
        whyRelevant: truncateText(keyword.whyRelevant, 120),
        explanationHint: truncateText(keyword.explanationHint, 120)
      }))
    },
    warnings: compactList(result.warnings, 8, 220),
    missingInputs: compactList(result.missingInputs, 8, 120),
    evidence: result.evidence.slice(0, 5)
  };
}

function normalizeMeetingFollowup(result: GenerateMeetingFollowupResult): GenerateMeetingFollowupResult {
  return {
    ...result,
    result: {
      shouldFollowUp: result.result.shouldFollowUp,
      followUpQuestions: compactList(result.result.followUpQuestions, 3, 95),
      followUpStrategy: truncateText(result.result.followUpStrategy, 180)
    },
    warnings: compactList(result.warnings, 8, 220),
    missingInputs: compactList(result.missingInputs, 8, 120),
    evidence: result.evidence.slice(0, 5)
  };
}

function normalizeMeetingKeywordHelp(result: GenerateMeetingKeywordHelpResult): GenerateMeetingKeywordHelpResult {
  return {
    ...result,
    result: {
      keywordSummary: truncateText(result.result.keywordSummary, 200),
      talkingPoints: compactList(result.result.talkingPoints, 3, 95),
      keywordStrategy: truncateText(result.result.keywordStrategy, 160)
    },
    warnings: compactList(result.warnings, 8, 220),
    missingInputs: compactList(result.missingInputs, 8, 120),
    evidence: result.evidence.slice(0, 5)
  };
}

function buildFallbackRealtimeKeywords(warning: string): SurfaceRealtimeKeywordsResult {
  return {
    status: "failed_policy",
    result: {
      shouldExpandOverlay: false,
      keywords: []
    },
    warnings: [`OpenAI realtime keyword fallback: ${warning}`],
    missingInputs: [],
    confidence: "low",
    evidence: []
  };
}

function buildFallbackMeetingAnswer(
  input: GenerateMeetingAnswerServiceInput,
  warning: string
): GenerateMeetingAnswerResult {
  return {
    status: "partial",
    result: {
      shouldAnswer: false,
      answerDraft: "Boleh saya klarifikasi sedikit konteksnya? Saya ingin memastikan respons saya tepat sebelum menjawab.",
      keyPoints: [],
      followUpNote: "Gunakan ini hanya jika konteks meeting belum jelas atau AI generation gagal."
    },
    warnings: [`OpenAI meeting response fallback: ${warning}`],
    missingInputs: input.meetingPrompt.trim() ? [] : ["latestMeetingFocus"],
    confidence: "low",
    evidence: []
  };
}

function buildFallbackMeetingExplanation(
  input: GenerateMeetingExplanationServiceInput,
  warning: string
): GenerateMeetingExplanationResult {
  return {
    status: "partial",
    result: {
      meaningSummary: "Lawan bicara kemungkinan ingin memastikan responsnya relevan, terstruktur, dan nyambung dengan konteks meeting.",
      signals: [
        "Apa inti konteks yang sedang dibahas.",
        "Apa respons atau klarifikasi yang paling relevan."
      ],
      answerAngle: "Respons dengan struktur singkat: pahami konteks, beri sudut pandang, lalu usulkan klarifikasi atau next step."
    },
    warnings: [`OpenAI meeting explanation fallback: ${warning}`],
    missingInputs: input.meetingPrompt.trim() ? [] : ["latestMeetingFocus"],
    confidence: "low",
    evidence: []
  };
}

function buildFallbackMeetingFollowup(
  input: GenerateMeetingFollowupServiceInput,
  warning: string
): GenerateMeetingFollowupResult {
  return {
    status: "partial",
    result: {
      shouldFollowUp: true,
      followUpQuestions: [
        "Boleh dijelaskan prioritas utama dari konteks ini?",
        "Apa kriteria yang paling penting untuk keputusan atau next step-nya?"
      ],
      followUpStrategy: "Gunakan follow-up ini untuk klarifikasi saat konteks meeting masih terlalu umum."
    },
    warnings: [`OpenAI meeting follow-up fallback: ${warning}`],
    missingInputs: input.meetingPrompt.trim() ? [] : ["latestMeetingFocus"],
    confidence: "low",
    evidence: []
  };
}

function buildFallbackMeetingKeywordHelp(
  input: GenerateMeetingKeywordHelpServiceInput,
  warning: string
): GenerateMeetingKeywordHelpResult {
  return {
    status: "partial",
    result: {
      keywordSummary: `${input.keyword} adalah keyword yang mungkin relevan dengan meeting ini, tetapi detail konteksnya belum cukup kuat.`,
      talkingPoints: [
        "Jelaskan arti keyword ini dalam konteks atau problem yang sedang dibahas.",
        "Hubungkan keyword ini ke pendekatan yang paling relevan.",
        "Jika perlu, klarifikasi metric, data, atau trade-off yang terkait."
      ],
      keywordStrategy: "Gunakan keyword ini sebagai anchor singkat, lalu kaitkan ke contoh yang paling relevan."
    },
    warnings: [`OpenAI meeting keyword help fallback: ${warning}`],
    missingInputs: input.keyword.trim() ? [] : ["keyword"],
    confidence: "low",
    evidence: []
  };
}

function compactList(items: string[], maxItems: number, maxCharacters: number) {
  return Array.from(new Set(items.map((item) => truncateText(item, maxCharacters)).filter(Boolean)))
    .slice(0, maxItems);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function truncateText(value: string, maxCharacters: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxCharacters) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxCharacters - 1)).trimEnd()}...`;
}
