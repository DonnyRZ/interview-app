import { z } from "zod";

export const healthResponseSchema = z.object({
  ok: z.boolean(),
  service: z.literal("orviko-api"),
  timestamp: z.string().datetime()
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
