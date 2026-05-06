import { z } from "zod";

export const interviewStageSchema = z.enum(["HR", "TECHNICAL", "USER", "FINAL", "OTHER"]);

export const realtimeDomainProfileSchema = z.object({
  primaryDomain: z.string(),
  nicheDescription: z.string(),
  inScopeConcepts: z.array(z.string()),
  outOfScopeConcepts: z.array(z.string()),
  seedConcepts: z.array(z.string()),
  relevanceGuidance: z.string()
});

export const realtimeContextSchema = z.object({
  candidateContext: z.object({
    summary: z.string(),
    readyContext: z.string(),
    skills: z.array(z.string()),
    relevantExperience: z.array(z.string()),
    strengthsForInterview: z.array(z.string()),
    risks: z.array(z.string())
  }),
  applicationContext: z.object({
    companyName: z.string(),
    roleTitle: z.string(),
    jdSummary: z.string(),
    roleRequirements: z.array(z.string()),
    interviewPrepThemes: z.array(z.string()),
    applicationContext: z.string()
  }),
  domainProfile: realtimeDomainProfileSchema,
  stageContext: z.object({
    stageType: interviewStageSchema,
    focus: z.array(z.string())
  })
});

export const interviewRoundSchema = z.object({
  id: z.string().uuid(),
  applicationId: z.string().uuid(),
  stageType: interviewStageSchema,
  transcriptText: z.string().nullable(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime()
});

export const startInterviewRequestSchema = z.object({
  applicationId: z.string().uuid(),
  stageType: interviewStageSchema
});

export const endInterviewRequestSchema = z.object({
  transcriptText: z.string().optional()
});

export const generateInterviewAnswerRequestSchema = z.object({
  interviewerQuestion: z.string(),
  recentTranscript: z.string().optional(),
  realtimeContext: realtimeContextSchema
});

export const generateInterviewAnswerResponseSchema = z.object({
  status: z.enum(["success", "partial", "insufficient_input", "needs_human_review", "failed_policy"]),
  result: z.object({
    shouldAnswer: z.boolean(),
    answerDraft: z.string(),
    keyPoints: z.array(z.string()),
    followUpNote: z.string()
  }),
  warnings: z.array(z.string()),
  missingInputs: z.array(z.string()),
  confidence: z.enum(["low", "medium", "high"]),
  evidence: z.array(z.object({
    field: z.string(),
    source: z.string(),
    quote: z.string().optional()
  }))
});

export const generateInterviewFollowupRequestSchema = z.object({
  interviewerQuestion: z.string(),
  recentTranscript: z.string().optional(),
  realtimeContext: realtimeContextSchema
});

export const generateInterviewFollowupResponseSchema = z.object({
  status: z.enum(["success", "partial", "insufficient_input", "needs_human_review", "failed_policy"]),
  result: z.object({
    shouldFollowUp: z.boolean(),
    followUpQuestions: z.array(z.string()),
    followUpStrategy: z.string()
  }),
  warnings: z.array(z.string()),
  missingInputs: z.array(z.string()),
  confidence: z.enum(["low", "medium", "high"]),
  evidence: z.array(z.object({
    field: z.string(),
    source: z.string(),
    quote: z.string().optional()
  }))
});

export const generateInterviewExplanationRequestSchema = z.object({
  interviewerQuestion: z.string(),
  recentTranscript: z.string().optional(),
  realtimeContext: realtimeContextSchema
});

export const generateInterviewExplanationResponseSchema = z.object({
  status: z.enum(["success", "partial", "insufficient_input", "needs_human_review", "failed_policy"]),
  result: z.object({
    meaningSummary: z.string(),
    signals: z.array(z.string()),
    answerAngle: z.string()
  }),
  warnings: z.array(z.string()),
  missingInputs: z.array(z.string()),
  confidence: z.enum(["low", "medium", "high"]),
  evidence: z.array(z.object({
    field: z.string(),
    source: z.string(),
    quote: z.string().optional()
  }))
});

export const generateInterviewKeywordHelpRequestSchema = z.object({
  keyword: z.string(),
  interviewerQuestion: z.string().optional(),
  recentTranscript: z.string().optional(),
  realtimeContext: realtimeContextSchema
});

export const generateInterviewKeywordHelpResponseSchema = z.object({
  status: z.enum(["success", "partial", "insufficient_input", "needs_human_review", "failed_policy"]),
  result: z.object({
    keywordSummary: z.string(),
    talkingPoints: z.array(z.string()),
    keywordStrategy: z.string()
  }),
  warnings: z.array(z.string()),
  missingInputs: z.array(z.string()),
  confidence: z.enum(["low", "medium", "high"]),
  evidence: z.array(z.object({
    field: z.string(),
    source: z.string(),
    quote: z.string().optional()
  }))
});

export const surfaceRealtimeKeywordsRequestSchema = z.object({
  transcriptSegment: z.string(),
  realtimeContext: realtimeContextSchema
});

export const surfaceRealtimeKeywordsResponseSchema = z.object({
  status: z.enum(["success", "partial", "insufficient_input", "needs_human_review", "failed_policy"]),
  result: z.object({
    shouldExpandOverlay: z.boolean(),
    keywords: z.array(z.object({
      term: z.string(),
      whyRelevant: z.string(),
      explanationHint: z.string()
    }))
  }),
  warnings: z.array(z.string()),
  missingInputs: z.array(z.string()),
  confidence: z.enum(["low", "medium", "high"]),
  evidence: z.array(z.object({
    field: z.string(),
    source: z.string(),
    quote: z.string().optional()
  }))
});

export const createRealtimeClientSecretRequestSchema = z.object({
  realtimeContext: realtimeContextSchema
});

export const createRealtimeClientSecretResponseSchema = z.object({
  model: z.literal("gpt-realtime-mini"),
  clientSecret: z.string(),
  expiresAt: z.number().int().positive(),
  session: z.unknown().optional()
});

export const interviewRoundResponseSchema = z.object({
  interviewRound: interviewRoundSchema,
  realtimeContext: realtimeContextSchema.optional()
});

export const interviewRoundListResponseSchema = z.object({
  interviewRounds: z.array(interviewRoundSchema)
});

export type InterviewStage = z.infer<typeof interviewStageSchema>;
export type RealtimeDomainProfile = z.infer<typeof realtimeDomainProfileSchema>;
export type RealtimeContext = z.infer<typeof realtimeContextSchema>;
export type InterviewRound = z.infer<typeof interviewRoundSchema>;
export type StartInterviewRequest = z.infer<typeof startInterviewRequestSchema>;
export type EndInterviewRequest = z.infer<typeof endInterviewRequestSchema>;
export type GenerateInterviewAnswerRequest = z.infer<typeof generateInterviewAnswerRequestSchema>;
export type GenerateInterviewAnswerResponse = z.infer<typeof generateInterviewAnswerResponseSchema>;
export type GenerateInterviewFollowupRequest = z.infer<typeof generateInterviewFollowupRequestSchema>;
export type GenerateInterviewFollowupResponse = z.infer<typeof generateInterviewFollowupResponseSchema>;
export type GenerateInterviewExplanationRequest = z.infer<typeof generateInterviewExplanationRequestSchema>;
export type GenerateInterviewExplanationResponse = z.infer<typeof generateInterviewExplanationResponseSchema>;
export type GenerateInterviewKeywordHelpRequest = z.infer<typeof generateInterviewKeywordHelpRequestSchema>;
export type GenerateInterviewKeywordHelpResponse = z.infer<typeof generateInterviewKeywordHelpResponseSchema>;
export type SurfaceRealtimeKeywordsRequest = z.infer<typeof surfaceRealtimeKeywordsRequestSchema>;
export type SurfaceRealtimeKeywordsResponse = z.infer<typeof surfaceRealtimeKeywordsResponseSchema>;
export type CreateRealtimeClientSecretRequest = z.infer<typeof createRealtimeClientSecretRequestSchema>;
export type CreateRealtimeClientSecretResponse = z.infer<typeof createRealtimeClientSecretResponseSchema>;
export type InterviewRoundResponse = z.infer<typeof interviewRoundResponseSchema>;
export type InterviewRoundListResponse = z.infer<typeof interviewRoundListResponseSchema>;
