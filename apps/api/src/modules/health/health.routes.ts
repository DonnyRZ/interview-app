import type { FastifyInstance } from "fastify";
import { healthResponseSchema } from "@interview-app/shared";

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get("/health", async () => {
    return healthResponseSchema.parse({
      ok: true,
      service: "interview-api",
      timestamp: new Date().toISOString()
    });
  });
}
