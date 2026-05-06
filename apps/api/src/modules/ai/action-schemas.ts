import { z } from "zod";

export const aiStatusSchema = z.enum([
  "success",
  "partial",
  "insufficient_input",
  "needs_human_review",
  "failed_policy"
]);

export const aiConfidenceSchema = z.enum(["low", "medium", "high"]);

const evidenceSchema = z.object({
  field: z.string(),
  source: z.string(),
  quote: z.string().optional()
});

const evidenceArraySchema = z.preprocess((value) => {
  if (value == null) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  return value;
}, z.array(evidenceSchema));

const textSchema = z.preprocess((value) => {
  if (value == null) {
    return "";
  }

  return value;
}, z.string());

const stringArraySchema = z.preprocess((value) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    return value.trim() ? [value] : [];
  }

  if (value == null) {
    return [];
  }

  return value;
}, z.array(z.string()));

const domainProfileSchema = z.object({
  primaryDomain: textSchema,
  nicheDescription: textSchema,
  inScopeConcepts: stringArraySchema,
  outOfScopeConcepts: stringArraySchema,
  seedConcepts: stringArraySchema,
  relevanceGuidance: textSchema
}).default({
  primaryDomain: "",
  nicheDescription: "",
  inScopeConcepts: [],
  outOfScopeConcepts: [],
  seedConcepts: [],
  relevanceGuidance: ""
});

export const preprocessCvResultSchema = z.object({
  status: aiStatusSchema,
  result: z.object({
    candidateSummary: z.string(),
    skills: stringArraySchema,
    relevantExperience: stringArraySchema,
    strengthsForInterview: stringArraySchema,
    risks: stringArraySchema,
    readyContext: z.string()
  }),
  warnings: stringArraySchema,
  missingInputs: stringArraySchema,
  confidence: aiConfidenceSchema,
  evidence: evidenceArraySchema
});

export const preprocessApplicationJdResultSchema = z.object({
  status: aiStatusSchema,
  result: z.object({
    jdSummary: z.string(),
    roleRequirements: stringArraySchema,
    domainProfile: domainProfileSchema,
    interviewPrepThemes: stringArraySchema,
    applicationContext: z.string()
  }),
  warnings: stringArraySchema,
  missingInputs: stringArraySchema,
  confidence: aiConfidenceSchema,
  evidence: evidenceArraySchema
});

const surfacedKeywordSchema = z.object({
  term: z.string(),
  whyRelevant: textSchema,
  explanationHint: textSchema
});

const surfacedKeywordArraySchema = z.preprocess((value) => {
  if (value == null) {
    return [];
  }

  if (!Array.isArray(value)) {
    return value;
  }

  return value.map((item) => {
    if (typeof item === "string") {
      return {
        term: item,
        whyRelevant: "",
        explanationHint: ""
      };
    }

    return item;
  });
}, z.array(surfacedKeywordSchema).max(3));

export const surfaceRealtimeKeywordsResultSchema = z.object({
  status: aiStatusSchema,
  result: z.object({
    shouldExpandOverlay: z.boolean().default(false),
    keywords: surfacedKeywordArraySchema
  }),
  warnings: stringArraySchema,
  missingInputs: stringArraySchema,
  confidence: aiConfidenceSchema,
  evidence: evidenceArraySchema
});

export const generateInterviewAnswerResultSchema = z.object({
  status: aiStatusSchema,
  result: z.object({
    shouldAnswer: z.boolean().default(true),
    answerDraft: textSchema,
    keyPoints: stringArraySchema,
    followUpNote: textSchema
  }),
  warnings: stringArraySchema,
  missingInputs: stringArraySchema,
  confidence: aiConfidenceSchema,
  evidence: evidenceArraySchema
});

export const generateInterviewFollowupResultSchema = z.object({
  status: aiStatusSchema,
  result: z.object({
    shouldFollowUp: z.boolean().default(true),
    followUpQuestions: stringArraySchema,
    followUpStrategy: textSchema
  }),
  warnings: stringArraySchema,
  missingInputs: stringArraySchema,
  confidence: aiConfidenceSchema,
  evidence: evidenceArraySchema
});

export const generateInterviewExplanationResultSchema = z.object({
  status: aiStatusSchema,
  result: z.object({
    meaningSummary: textSchema,
    signals: stringArraySchema,
    answerAngle: textSchema
  }),
  warnings: stringArraySchema,
  missingInputs: stringArraySchema,
  confidence: aiConfidenceSchema,
  evidence: evidenceArraySchema
});

export const generateInterviewKeywordHelpResultSchema = z.object({
  status: aiStatusSchema,
  result: z.object({
    keywordSummary: textSchema,
    talkingPoints: stringArraySchema,
    keywordStrategy: textSchema
  }),
  warnings: stringArraySchema,
  missingInputs: stringArraySchema,
  confidence: aiConfidenceSchema,
  evidence: evidenceArraySchema
});

export type PreprocessCvResult = z.infer<typeof preprocessCvResultSchema>;
export type PreprocessApplicationJdResult = z.infer<typeof preprocessApplicationJdResultSchema>;
export type SurfaceRealtimeKeywordsResult = z.infer<typeof surfaceRealtimeKeywordsResultSchema>;
export type GenerateInterviewAnswerResult = z.infer<typeof generateInterviewAnswerResultSchema>;
export type GenerateInterviewFollowupResult = z.infer<typeof generateInterviewFollowupResultSchema>;
export type GenerateInterviewExplanationResult = z.infer<typeof generateInterviewExplanationResultSchema>;
export type GenerateInterviewKeywordHelpResult = z.infer<typeof generateInterviewKeywordHelpResultSchema>;
