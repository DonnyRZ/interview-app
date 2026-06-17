import { z } from "zod";

export const meetingSessionTypeSchema = z.enum(["HR", "TECHNICAL", "USER", "FINAL", "OTHER"]);

export const realtimeDomainProfileSchema = z.object({
  primaryDomain: z.string(),
  nicheDescription: z.string(),
  inScopeConcepts: z.array(z.string()),
  outOfScopeConcepts: z.array(z.string()),
  seedConcepts: z.array(z.string()),
  relevanceGuidance: z.string()
});

export const realtimeUserExperienceSchema = z.object({
  organizationName: z.string(),
  roleTitle: z.string(),
  dateRange: z.string(),
  duration: z.string(),
  projects: z.array(z.string()),
  responsibilities: z.array(z.string()),
  impact: z.array(z.string()),
  technologies: z.array(z.string())
});

export const realtimeUserEducationSchema = z.object({
  institution: z.string(),
  degree: z.string(),
  major: z.string(),
  dateRange: z.string(),
  notes: z.array(z.string())
});

export const realtimeUserOrganizationSchema = z.object({
  organizationName: z.string(),
  roleTitle: z.string(),
  dateRange: z.string(),
  responsibilities: z.array(z.string())
});

export const realtimeUserInternshipSchema = z.object({
  organizationName: z.string(),
  roleTitle: z.string(),
  dateRange: z.string(),
  duration: z.string(),
  responsibilities: z.array(z.string()),
  projects: z.array(z.string())
});

export const realtimeContextSchema = z.object({
  userProfileContext: z.object({
    summary: z.string(),
    readyContext: z.string(),
    skills: z.array(z.string()),
    relevantExperience: z.array(z.string()),
    experiences: z.array(realtimeUserExperienceSchema),
    education: z.array(realtimeUserEducationSchema),
    organizations: z.array(realtimeUserOrganizationSchema),
    internships: z.array(realtimeUserInternshipSchema),
    usefulStrengths: z.array(z.string()),
    risks: z.array(z.string())
  }),
  meetingContext: z.object({
    contextName: z.string(),
    meetingTopic: z.string(),
    meetingSummary: z.string(),
    keyCriteria: z.array(z.string()),
    responsibilities: z.array(z.string()),
    niceToHave: z.array(z.string()),
    preparationThemes: z.array(z.string()),
    contextText: z.string()
  }),
  domainProfile: realtimeDomainProfileSchema,
  sessionContext: z.object({
    sessionType: meetingSessionTypeSchema,
    focus: z.array(z.string())
  })
});

export const liveMeetingSessionSchema = z.object({
  id: z.string().uuid(),
  meetingContextId: z.string().uuid(),
  sessionType: meetingSessionTypeSchema,
  transcriptText: z.string().nullable(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime()
});

export const startLiveMeetingRequestSchema = z.object({
  meetingContextId: z.string().uuid(),
  sessionType: meetingSessionTypeSchema
});

export const endLiveMeetingRequestSchema = z.object({
  transcriptText: z.string().optional()
});

export const generateMeetingAnswerRequestSchema = z.object({
  meetingPrompt: z.string(),
  recentTranscript: z.string().optional(),
  realtimeContext: realtimeContextSchema
});

export const generateMeetingAnswerResponseSchema = z.object({
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

export const generateMeetingFollowupRequestSchema = z.object({
  meetingPrompt: z.string(),
  recentTranscript: z.string().optional(),
  realtimeContext: realtimeContextSchema
});

export const generateMeetingFollowupResponseSchema = z.object({
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

export const generateMeetingExplanationRequestSchema = z.object({
  meetingPrompt: z.string(),
  recentTranscript: z.string().optional(),
  realtimeContext: realtimeContextSchema
});

export const generateMeetingExplanationResponseSchema = z.object({
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

export const generateMeetingKeywordHelpRequestSchema = z.object({
  keyword: z.string(),
  meetingPrompt: z.string().optional(),
  recentTranscript: z.string().optional(),
  realtimeContext: realtimeContextSchema
});

export const generateMeetingKeywordHelpResponseSchema = z.object({
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
  liveMeetingSessionId: z.string().uuid()
});

export const createRealtimeClientSecretResponseSchema = z.object({
  model: z.literal("gpt-realtime-mini"),
  clientSecret: z.string(),
  expiresAt: z.number().int().positive(),
  session: z.unknown().optional()
});

export const liveMeetingSessionResponseSchema = z.object({
  liveMeetingSession: liveMeetingSessionSchema,
  realtimeContext: realtimeContextSchema.optional()
});

export const liveMeetingSessionListResponseSchema = z.object({
  liveMeetingSessions: z.array(liveMeetingSessionSchema)
});

export const deleteLiveMeetingSessionResponseSchema = z.object({
  ok: z.literal(true),
  deletedLiveMeetingSessionId: z.string().uuid()
});

export type MeetingSessionType = z.infer<typeof meetingSessionTypeSchema>;
export type RealtimeDomainProfile = z.infer<typeof realtimeDomainProfileSchema>;
export type RealtimeUserExperience = z.infer<typeof realtimeUserExperienceSchema>;
export type RealtimeUserEducation = z.infer<typeof realtimeUserEducationSchema>;
export type RealtimeUserOrganization = z.infer<typeof realtimeUserOrganizationSchema>;
export type RealtimeUserInternship = z.infer<typeof realtimeUserInternshipSchema>;
export type RealtimeContext = z.infer<typeof realtimeContextSchema>;
export type LiveMeetingSession = z.infer<typeof liveMeetingSessionSchema>;
export type StartLiveMeetingRequest = z.infer<typeof startLiveMeetingRequestSchema>;
export type EndLiveMeetingRequest = z.infer<typeof endLiveMeetingRequestSchema>;
export type GenerateMeetingAnswerRequest = z.infer<typeof generateMeetingAnswerRequestSchema>;
export type GenerateMeetingAnswerResponse = z.infer<typeof generateMeetingAnswerResponseSchema>;
export type GenerateMeetingFollowupRequest = z.infer<typeof generateMeetingFollowupRequestSchema>;
export type GenerateMeetingFollowupResponse = z.infer<typeof generateMeetingFollowupResponseSchema>;
export type GenerateMeetingExplanationRequest = z.infer<typeof generateMeetingExplanationRequestSchema>;
export type GenerateMeetingExplanationResponse = z.infer<typeof generateMeetingExplanationResponseSchema>;
export type GenerateMeetingKeywordHelpRequest = z.infer<typeof generateMeetingKeywordHelpRequestSchema>;
export type GenerateMeetingKeywordHelpResponse = z.infer<typeof generateMeetingKeywordHelpResponseSchema>;
export type SurfaceRealtimeKeywordsRequest = z.infer<typeof surfaceRealtimeKeywordsRequestSchema>;
export type SurfaceRealtimeKeywordsResponse = z.infer<typeof surfaceRealtimeKeywordsResponseSchema>;
export type CreateRealtimeClientSecretRequest = z.infer<typeof createRealtimeClientSecretRequestSchema>;
export type CreateRealtimeClientSecretResponse = z.infer<typeof createRealtimeClientSecretResponseSchema>;
export type LiveMeetingSessionResponse = z.infer<typeof liveMeetingSessionResponseSchema>;
export type LiveMeetingSessionListResponse = z.infer<typeof liveMeetingSessionListResponseSchema>;
export type DeleteLiveMeetingSessionResponse = z.infer<typeof deleteLiveMeetingSessionResponseSchema>;
