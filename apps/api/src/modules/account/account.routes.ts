import type { FastifyInstance } from "fastify";
import { getRequestSession } from "../auth/request-session.js";
import { clearSessionCookie, revokeAllSessionsForUser } from "../auth/session.js";
import { deleteAccountForUser, exportAccountData } from "./account.service.js";

export async function registerAccountRoutes(app: FastifyInstance) {
  app.post("/export", async (request, reply) => {
    const session = await getRequestSession(request);
    if (!session) {
      return reply.code(401).send({ message: "Login diperlukan." });
    }

    const exportData = await exportAccountData(session.userId);
    if (!exportData) {
      return reply.code(404).send({ message: "Account not found" });
    }

    return {
      accountExport: exportData
    };
  });

  app.delete("/", async (request, reply) => {
    const session = await getRequestSession(request);
    if (!session) {
      return reply.code(401).send({ message: "Login diperlukan." });
    }

    const deletionJob = await deleteAccountForUser(session.userId);
    if (!deletionJob) {
      clearSessionCookie(reply);
      return reply.code(404).send({ message: "Account not found" });
    }

    await revokeAllSessionsForUser(session.userId).catch(() => undefined);
    clearSessionCookie(reply);
    return {
      ok: true,
      deletionJob: {
        id: deletionJob.id,
        status: deletionJob.status,
        completedAt: deletionJob.completedAt
      }
    };
  });
}
