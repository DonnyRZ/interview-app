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

const profileDocumentExperienceSchema = z.object({
  organizationName: textSchema,
  roleTitle: textSchema,
  dateRange: textSchema,
  duration: textSchema,
  projects: stringArraySchema,
  responsibilities: stringArraySchema,
  impact: stringArraySchema,
  technologies: stringArraySchema
});

const profileDocumentEducationSchema = z.object({
  institution: textSchema,
  degree: textSchema,
  major: textSchema,
  dateRange: textSchema,
  notes: stringArraySchema
});

const profileDocumentOrganizationSchema = z.object({
  organizationName: textSchema,
  roleTitle: textSchema,
  dateRange: textSchema,
  responsibilities: stringArraySchema
});

const profileDocumentInternshipSchema = z.object({
  organizationName: textSchema,
  roleTitle: textSchema,
  dateRange: textSchema,
  duration: textSchema,
  responsibilities: stringArraySchema,
  projects: stringArraySchema
});

function objectArraySchema<TSchema extends z.ZodTypeAny>(schema: TSchema) {
  return z.preprocess((value) => {
    if (value == null) {
      return [];
    }

    return value;
  }, z.array(schema)).default([]);
}

function recordFrom(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

const preprocessUserProfileResultObjectSchema = z.preprocess((value) => {
  const record = recordFrom(value);
  return {
    ...record,
    userProfileSummary: record.userProfileSummary ?? record.userProfileSummary,
    usefulStrengths: record.usefulStrengths ?? record.usefulStrengths
  };
}, z.object({
  userProfileSummary: z.string(),
  skills: stringArraySchema,
  relevantExperience: stringArraySchema,
  experiences: objectArraySchema(profileDocumentExperienceSchema),
  education: objectArraySchema(profileDocumentEducationSchema),
  organizations: objectArraySchema(profileDocumentOrganizationSchema),
  internships: objectArraySchema(profileDocumentInternshipSchema),
  usefulStrengths: stringArraySchema,
  risks: stringArraySchema,
  readyContext: z.string()
}));

const preprocessMeetingContextResultObjectSchema = z.preprocess((value) => {
  const record = recordFrom(value);
  return {
    ...record,
    meetingSummary: record.meetingSummary ?? record.meetingSummary,
    keyCriteria: record.keyCriteria ?? record.keyCriteria,
    preparationThemes: record.preparationThemes ?? record.preparationThemes
  };
}, z.object({
  meetingSummary: z.string(),
  keyCriteria: stringArraySchema,
  responsibilities: stringArraySchema.default([]),
  niceToHave: stringArraySchema.default([]),
  domainProfile: domainProfileSchema,
  preparationThemes: stringArraySchema,
    contextText: z.string()
}));

export const preprocessProfileDocumentResultSchema = z.object({
  status: aiStatusSchema,
  result: preprocessUserProfileResultObjectSchema,
  warnings: stringArraySchema,
  missingInputs: stringArraySchema,
  confidence: aiConfidenceSchema,
  evidence: evidenceArraySchema
});

export const preprocessMeetingContextResultSchema = z.object({
  status: aiStatusSchema,
  result: preprocessMeetingContextResultObjectSchema,
  warnings: stringArraySchema,
  missingInputs: stringArraySchema,
  confidence: aiConfidenceSchema,
  evidence: evidenceArraySchema
});

export const generateMeetingAnswerResultSchema = z.object({
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

export const generateMeetingFollowupResultSchema = z.object({
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

export const generateMeetingExplanationResultSchema = z.object({
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

export const generateMeetingKeywordHelpResultSchema = z.object({
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

export type PreprocessProfileDocumentResult = z.infer<typeof preprocessProfileDocumentResultSchema>;
export type PreprocessMeetingContextResult = z.infer<typeof preprocessMeetingContextResultSchema>;
export type GenerateMeetingAnswerResult = z.infer<typeof generateMeetingAnswerResultSchema>;
export type GenerateMeetingFollowupResult = z.infer<typeof generateMeetingFollowupResultSchema>;
export type GenerateMeetingExplanationResult = z.infer<typeof generateMeetingExplanationResultSchema>;
export type GenerateMeetingKeywordHelpResult = z.infer<typeof generateMeetingKeywordHelpResultSchema>;
export type SurfaceRealtimeKeywordsResult = z.infer<typeof surfaceRealtimeKeywordsResultSchema>;
