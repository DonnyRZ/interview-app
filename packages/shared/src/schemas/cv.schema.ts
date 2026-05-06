import { z } from "zod";

export const cvSchema = z.object({
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

export const cvListResponseSchema = z.object({
  cvs: z.array(cvSchema)
});

export const activeCvResponseSchema = z.object({
  cv: cvSchema.nullable()
});

export const uploadCvResponseSchema = z.object({
  cv: cvSchema
});

export const setActiveCvResponseSchema = z.object({
  cv: cvSchema
});

export const retryCvProcessingResponseSchema = z.object({
  cv: cvSchema
});

export type Cv = z.infer<typeof cvSchema>;
export type CvListResponse = z.infer<typeof cvListResponseSchema>;
export type ActiveCvResponse = z.infer<typeof activeCvResponseSchema>;
export type UploadCvResponse = z.infer<typeof uploadCvResponseSchema>;
export type SetActiveCvResponse = z.infer<typeof setActiveCvResponseSchema>;
export type RetryCvProcessingResponse = z.infer<typeof retryCvProcessingResponseSchema>;
