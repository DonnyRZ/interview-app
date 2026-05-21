import type { RealtimeContext } from "@interview-app/shared";
import {
  surfaceRealtimeKeywordsResultSchema,
  generateInterviewExplanationResultSchema,
  generateInterviewKeywordHelpResultSchema,
  generateInterviewFollowupResultSchema,
  generateInterviewAnswerResultSchema,
  type SurfaceRealtimeKeywordsResult,
  type GenerateInterviewExplanationResult,
  type GenerateInterviewKeywordHelpResult,
  type GenerateInterviewFollowupResult,
  type GenerateInterviewAnswerResult
} from "../ai/action-schemas.js";
import { runOpenAiJsonAction } from "../ai/action-runner.js";
import {
  surfaceRealtimeKeywordsSpec,
  generateInterviewAnswerSpec,
  generateInterviewExplanationSpec,
  generateInterviewFollowupSpec,
  generateInterviewKeywordHelpSpec
} from "../ai/action-specs.js";

export type GenerateInterviewAnswerServiceInput = {
  interviewerQuestion: string;
  recentTranscript?: string;
  realtimeContext: RealtimeContext;
};

export type GenerateInterviewFollowupServiceInput = GenerateInterviewAnswerServiceInput;
export type GenerateInterviewExplanationServiceInput = GenerateInterviewAnswerServiceInput;
export type GenerateInterviewKeywordHelpServiceInput = {
  keyword: string;
  interviewerQuestion?: string;
  recentTranscript?: string;
  realtimeContext: RealtimeContext;
};
export type SurfaceRealtimeKeywordsServiceInput = {
  transcriptSegment: string;
  realtimeContext: RealtimeContext;
};

const realtimeKeywordTimeoutMs = 6_000;

export async function surfaceRealtimeKeywords(
  input: SurfaceRealtimeKeywordsServiceInput
): Promise<SurfaceRealtimeKeywordsResult> {
  const transcriptSegment = input.transcriptSegment.trim();

  if (!transcriptSegment) {
    return buildFallbackRealtimeKeywords("Transcript interviewer kosong atau belum terdeteksi.");
  }

  try {
    const result = await withTimeout(runOpenAiJsonAction({
      spec: surfaceRealtimeKeywordsSpec,
      input: {
        transcriptSegment,
        realtimeContext: input.realtimeContext
      },
      outputSchema: surfaceRealtimeKeywordsResultSchema
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

export async function generateInterviewAnswer(
  input: GenerateInterviewAnswerServiceInput
): Promise<GenerateInterviewAnswerResult> {
  const normalizedQuestion = input.interviewerQuestion.trim();

  if (!normalizedQuestion) {
    return buildFallbackInterviewAnswer(input, "Pertanyaan interviewer kosong atau belum terdeteksi.");
  }

  try {
    const result = await runOpenAiJsonAction({
      spec: generateInterviewAnswerSpec,
      input: {
        ...input,
        interviewerQuestion: normalizedQuestion
      },
      outputSchema: generateInterviewAnswerResultSchema
    });

    return normalizeInterviewAnswer({
      ...result.output,
      warnings: [
        ...result.output.warnings,
        `AI metadata: ${result.metadata.actionId} ${result.metadata.promptVersion} using ${result.metadata.model}`
      ]
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown OpenAI interview answer error";
    console.warn(`[ai:fallback] generate_interview_answer failed: ${message}`);
    return buildFallbackInterviewAnswer(input, message);
  }
}

export async function generateInterviewExplanation(
  input: GenerateInterviewExplanationServiceInput
): Promise<GenerateInterviewExplanationResult> {
  const normalizedQuestion = input.interviewerQuestion.trim();

  if (!normalizedQuestion) {
    return buildFallbackInterviewExplanation(input, "Pertanyaan interviewer kosong atau belum terdeteksi.");
  }

  try {
    const result = await runOpenAiJsonAction({
      spec: generateInterviewExplanationSpec,
      input: {
        ...input,
        interviewerQuestion: normalizedQuestion
      },
      outputSchema: generateInterviewExplanationResultSchema
    });

    return normalizeInterviewExplanation({
      ...result.output,
      warnings: [
        ...result.output.warnings,
        `AI metadata: ${result.metadata.actionId} ${result.metadata.promptVersion} using ${result.metadata.model}`
      ]
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown OpenAI interview explanation error";
    console.warn(`[ai:fallback] generate_interview_explanation failed: ${message}`);
    return buildFallbackInterviewExplanation(input, message);
  }
}

export async function generateInterviewFollowup(
  input: GenerateInterviewFollowupServiceInput
): Promise<GenerateInterviewFollowupResult> {
  const normalizedQuestion = input.interviewerQuestion.trim();

  if (!normalizedQuestion) {
    return buildFallbackInterviewFollowup(input, "Pertanyaan interviewer kosong atau belum terdeteksi.");
  }

  try {
    const result = await runOpenAiJsonAction({
      spec: generateInterviewFollowupSpec,
      input: {
        ...input,
        interviewerQuestion: normalizedQuestion
      },
      outputSchema: generateInterviewFollowupResultSchema
    });

    return normalizeInterviewFollowup({
      ...result.output,
      warnings: [
        ...result.output.warnings,
        `AI metadata: ${result.metadata.actionId} ${result.metadata.promptVersion} using ${result.metadata.model}`
      ]
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown OpenAI interview follow-up error";
    console.warn(`[ai:fallback] generate_interview_followup failed: ${message}`);
    return buildFallbackInterviewFollowup(input, message);
  }
}

export async function generateInterviewKeywordHelp(
  input: GenerateInterviewKeywordHelpServiceInput
): Promise<GenerateInterviewKeywordHelpResult> {
  const normalizedKeyword = input.keyword.trim();

  if (!normalizedKeyword) {
    return buildFallbackInterviewKeywordHelp(input, "Keyword kosong atau belum tersedia.");
  }

  try {
    const result = await runOpenAiJsonAction({
      spec: generateInterviewKeywordHelpSpec,
      input: {
        ...input,
        keyword: normalizedKeyword
      },
      outputSchema: generateInterviewKeywordHelpResultSchema
    });

    return normalizeInterviewKeywordHelp({
      ...result.output,
      warnings: [
        ...result.output.warnings,
        `AI metadata: ${result.metadata.actionId} ${result.metadata.promptVersion} using ${result.metadata.model}`
      ]
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown OpenAI interview keyword help error";
    console.warn(`[ai:fallback] generate_interview_keyword_help failed: ${message}`);
    return buildFallbackInterviewKeywordHelp(input, message);
  }
}

function normalizeInterviewAnswer(result: GenerateInterviewAnswerResult): GenerateInterviewAnswerResult {
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

function normalizeInterviewExplanation(result: GenerateInterviewExplanationResult): GenerateInterviewExplanationResult {
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

function normalizeInterviewFollowup(result: GenerateInterviewFollowupResult): GenerateInterviewFollowupResult {
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

function normalizeInterviewKeywordHelp(result: GenerateInterviewKeywordHelpResult): GenerateInterviewKeywordHelpResult {
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

function buildFallbackInterviewAnswer(
  input: GenerateInterviewAnswerServiceInput,
  warning: string
): GenerateInterviewAnswerResult {
  const roleTitle = input.realtimeContext.applicationContext.roleTitle || "role ini";
  return {
    status: "partial",
    result: {
      shouldAnswer: false,
      answerDraft: `Boleh saya klarifikasi sedikit pertanyaannya? Saya ingin memastikan jawaban saya relevan dengan kebutuhan ${roleTitle}.`,
      keyPoints: [],
      followUpNote: "Gunakan ini hanya jika pertanyaan interviewer belum jelas atau AI generation gagal."
    },
    warnings: [`OpenAI interview answer fallback: ${warning}`],
    missingInputs: input.interviewerQuestion.trim() ? [] : ["interviewerQuestion"],
    confidence: "low",
    evidence: []
  };
}

function buildFallbackInterviewExplanation(
  input: GenerateInterviewExplanationServiceInput,
  warning: string
): GenerateInterviewExplanationResult {
  const roleTitle = input.realtimeContext.applicationContext.roleTitle || "role ini";
  return {
    status: "partial",
    result: {
      meaningSummary: `Interviewer kemungkinan ingin melihat apakah jawabanmu relevan, terstruktur, dan nyambung dengan kebutuhan ${roleTitle}.`,
      signals: [
        "Apakah kamu paham inti pertanyaannya.",
        "Apakah kamu bisa menghubungkan jawaban ke pengalaman atau logika yang relevan."
      ],
      answerAngle: "Jawab dengan struktur singkat: konteks, pendekatan, lalu hasil atau trade-off yang paling relevan."
    },
    warnings: [`OpenAI interview explanation fallback: ${warning}`],
    missingInputs: input.interviewerQuestion.trim() ? [] : ["interviewerQuestion"],
    confidence: "low",
    evidence: []
  };
}

function buildFallbackInterviewFollowup(
  input: GenerateInterviewFollowupServiceInput,
  warning: string
): GenerateInterviewFollowupResult {
  const roleTitle = input.realtimeContext.applicationContext.roleTitle || "role ini";
  return {
    status: "partial",
    result: {
      shouldFollowUp: true,
      followUpQuestions: [
        `Boleh dijelaskan prioritas utama untuk ${roleTitle} ini?`,
        "Metric apa yang paling penting untuk interviewer di konteks ini?"
      ],
      followUpStrategy: "Gunakan follow-up ini untuk klarifikasi saat konteks interviewer masih terlalu umum."
    },
    warnings: [`OpenAI interview follow-up fallback: ${warning}`],
    missingInputs: input.interviewerQuestion.trim() ? [] : ["interviewerQuestion"],
    confidence: "low",
    evidence: []
  };
}

function buildFallbackInterviewKeywordHelp(
  input: GenerateInterviewKeywordHelpServiceInput,
  warning: string
): GenerateInterviewKeywordHelpResult {
  return {
    status: "partial",
    result: {
      keywordSummary: `${input.keyword} adalah keyword yang relevan dengan role ini, tetapi detail konteksnya belum cukup kuat.`,
      talkingPoints: [
        "Jelaskan arti keyword ini dalam workflow atau problem yang sedang dibahas.",
        "Hubungkan keyword ini ke pengalaman atau pendekatan yang paling relevan.",
        "Jika perlu, klarifikasi metric, data, atau trade-off yang terkait."
      ],
      keywordStrategy: "Gunakan keyword ini sebagai anchor singkat, lalu kaitkan ke contoh yang paling relevan."
    },
    warnings: [`OpenAI interview keyword help fallback: ${warning}`],
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
