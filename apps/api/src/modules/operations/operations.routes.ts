import type { FastifyInstance } from "fastify";
import { sql } from "../../db/client.js";
import { env } from "../../env.js";

export async function registerOperationsRoutes(app: FastifyInstance) {
  app.get("/metrics", async (request, reply) => {
    if (!env.OPERATIONS_TOKEN || request.headers.authorization !== `Bearer ${env.OPERATIONS_TOKEN}`) {
      return reply.code(404).send({ message: "Not found" });
    }

    const [snapshot] = await sql<{
      activeMeetings: number;
      queuedJobs: number;
      runningJobs: number;
      failedJobs24h: number;
      stuckJobs: number;
    }[]>`
      SELECT
        (SELECT count(*)::int FROM "live_meeting_sessions" WHERE "ended_at" IS NULL) AS "activeMeetings",
        (SELECT count(*)::int FROM "ai_processing_jobs" WHERE "status" = 'queued') AS "queuedJobs",
        (SELECT count(*)::int FROM "ai_processing_jobs" WHERE "status" = 'running') AS "runningJobs",
        (
          SELECT count(*)::int
          FROM "ai_processing_jobs"
          WHERE "status" = 'failed'
            AND "updated_at" >= now() - interval '24 hours'
        ) AS "failedJobs24h",
        (
          SELECT count(*)::int
          FROM "ai_processing_jobs"
          WHERE "status" = 'running'
            AND "locked_at" < now() - (${env.AI_JOB_STUCK_MINUTES} * interval '1 minute')
        ) AS "stuckJobs"
    `;

    return {
      service: "orviko-api",
      timestamp: new Date().toISOString(),
      ...snapshot
    };
  });
}
