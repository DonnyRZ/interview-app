import { z } from "zod";

export const meetingContextStatusSchema = z.enum(["active", "archived"]);

export const meetingContextSchema = z.object({
  id: z.string().uuid(),
  profileDocumentId: z.string().uuid(),
  contextName: z.string(),
  meetingTopic: z.string(),
  meetingBrief: z.string().nullable(),
  meetingSummaryJson: z.unknown().nullable(),
  meetingContextText: z.string().nullable(),
  status: meetingContextStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const createMeetingContextRequestSchema = z.object({
  contextName: z.string().min(1),
  meetingTopic: z.string().min(1),
  meetingBrief: z.string().optional()
});

export const updateMeetingContextRequestSchema = createMeetingContextRequestSchema.partial().extend({
  profileDocumentId: z.string().uuid().optional(),
  status: meetingContextStatusSchema.optional()
});

export const meetingContextListResponseSchema = z.object({
  meetingContexts: z.array(meetingContextSchema)
});

export const meetingContextResponseSchema = z.object({
  meetingContext: meetingContextSchema
});

export const deleteMeetingContextResponseSchema = z.object({
  ok: z.literal(true),
  deletedMeetingContextId: z.string().uuid()
});

export type MeetingContext = z.infer<typeof meetingContextSchema>;
export type MeetingContextStatus = z.infer<typeof meetingContextStatusSchema>;
export type CreateMeetingContextRequest = z.infer<typeof createMeetingContextRequestSchema>;
export type UpdateMeetingContextRequest = z.infer<typeof updateMeetingContextRequestSchema>;
export type MeetingContextListResponse = z.infer<typeof meetingContextListResponseSchema>;
export type MeetingContextResponse = z.infer<typeof meetingContextResponseSchema>;
export type DeleteMeetingContextResponse = z.infer<typeof deleteMeetingContextResponseSchema>;
