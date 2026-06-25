import type { FastifyInstance } from "fastify";
import { healthResponseSchema } from "@interview-app/shared";
import { collectReadiness } from "./readiness.service.js";

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get("/health", async () => {
    return healthResponseSchema.parse({
      ok: true,
      service: "orviko-api",
      timestamp: new Date().toISOString()
    });
  });

  app.get("/ready", async (_request, reply) => {
    const readiness = await collectReadiness();
    return reply.code(readiness.ok ? 200 : 503).send(readiness);
  });
}
