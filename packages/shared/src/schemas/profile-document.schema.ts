import { z } from "zod";

export const profileDocumentSchema = z.object({
  id: z.string().uuid(),
  fileName: z.string(),
  fileMimeType: z.string().nullable(),
  summaryJson: z.unknown().nullable(),
  readyContext: z.string().nullable(),
  processingStatus: z.enum(["uploaded", "processing", "ready", "failed"]),
  processingError: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string().datetime()
});

export const profileDocumentListResponseSchema = z.object({
  profileDocuments: z.array(profileDocumentSchema)
});

export const activeProfileDocumentResponseSchema = z.object({
  profileDocument: profileDocumentSchema.nullable()
});

export const uploadProfileDocumentResponseSchema = z.object({
  profileDocument: profileDocumentSchema
});

export const setActiveProfileDocumentResponseSchema = z.object({
  profileDocument: profileDocumentSchema
});

export const retryProfileDocumentProcessingResponseSchema = z.object({
  profileDocument: profileDocumentSchema
});

export const deleteProfileDocumentResponseSchema = z.object({
  ok: z.literal(true),
  deletedProfileDocumentId: z.string().uuid()
});

export type ProfileDocument = z.infer<typeof profileDocumentSchema>;
export type ProfileDocumentListResponse = z.infer<typeof profileDocumentListResponseSchema>;
export type ActiveProfileDocumentResponse = z.infer<typeof activeProfileDocumentResponseSchema>;
export type UploadProfileDocumentResponse = z.infer<typeof uploadProfileDocumentResponseSchema>;
export type SetActiveProfileDocumentResponse = z.infer<typeof setActiveProfileDocumentResponseSchema>;
export type RetryProfileDocumentProcessingResponse = z.infer<typeof retryProfileDocumentProcessingResponseSchema>;
export type DeleteProfileDocumentResponse = z.infer<typeof deleteProfileDocumentResponseSchema>;
