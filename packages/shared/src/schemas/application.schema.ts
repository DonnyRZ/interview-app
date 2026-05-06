import { z } from "zod";

export const applicationSchema = z.object({
  id: z.string().uuid(),
  cvId: z.string().uuid(),
  companyName: z.string(),
  roleTitle: z.string(),
  jobDescription: z.string().nullable(),
  jobSummaryJson: z.unknown().nullable(),
  companyContext: z.string().nullable(),
  status: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const createApplicationRequestSchema = z.object({
  companyName: z.string().min(1),
  roleTitle: z.string().min(1),
  jobDescription: z.string().optional()
});

export const updateApplicationRequestSchema = createApplicationRequestSchema.partial().extend({
  status: z.string().optional()
});

export const applicationListResponseSchema = z.object({
  applications: z.array(applicationSchema)
});

export const applicationResponseSchema = z.object({
  application: applicationSchema
});

export type Application = z.infer<typeof applicationSchema>;
export type CreateApplicationRequest = z.infer<typeof createApplicationRequestSchema>;
export type UpdateApplicationRequest = z.infer<typeof updateApplicationRequestSchema>;
export type ApplicationListResponse = z.infer<typeof applicationListResponseSchema>;
export type ApplicationResponse = z.infer<typeof applicationResponseSchema>;
