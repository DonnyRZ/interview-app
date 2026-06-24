import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../../env.js";
import { planSlugSchema } from "../payments/plan-catalog.js";
import { buildGoogleLoginUrl, exchangeGoogleCode, fetchGoogleUserInfo } from "./google-oauth.js";
import { findUserById, GoogleAccountConflictError, upsertGoogleUser } from "./auth.service.js";
import {
  clearSessionCookie,
  consumeOAuthState,
  createOAuthState,
  getSession,
  revokeAllSessionsForUser,
  revokeCurrentSession,
  setSessionCookie
} from "./session.js";

const loginQuerySchema = z.object({
  plan: planSlugSchema,
  flow: z.enum(["web", "web-app"]).default("web")
});

const callbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional()
});

function mapAuthUser(user: Awaited<ReturnType<typeof findUserById>>) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    picture: user.picture,
    subscriptionPlan: user.subscriptionPlan,
    subscriptionExpiresAt: user.subscriptionExpiresAt?.toISOString() || null,
    subscriptionPeriodStartedAt: user.subscriptionPeriodStartedAt?.toISOString() || null
  };
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.get("/google/login", async (request, reply) => {
    const query = loginQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send({ message: "Paket yang dipilih tidak valid." });
    }

    try {
      const state = await createOAuthState(reply, query.data.plan, query.data.flow);
      return reply.redirect(buildGoogleLoginUrl(state));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal memulai login Google.";
      return reply.code(500).send({ message });
    }
  });

  app.get("/google/callback", async (request, reply) => {
    const query = callbackQuerySchema.safeParse(request.query);
    if (!query.success || !query.data.code) {
      return reply.code(400).send({ message: "Code dari Google tidak ditemukan." });
    }

    const state = await consumeOAuthState(request, reply, query.data.state);
    const plan = planSlugSchema.safeParse(state?.plan);
    if (!state || !plan.success) {
      return reply.code(400).send({ message: "State login Google tidak valid atau sudah kedaluwarsa." });
    }

    try {
      const accessToken = await exchangeGoogleCode(query.data.code);
      const userInfo = await fetchGoogleUserInfo(accessToken);
      const user = await upsertGoogleUser(userInfo);
      await revokeCurrentSession(request);
      await setSessionCookie(reply, { userId: user.id });
      if (state.flow === "web-app") {
        return reply.redirect(`${env.FRONTEND_BASE_URL.replace(/\/$/, "")}/app/`);
      }
      return reply.redirect(`${env.FRONTEND_BASE_URL.replace(/\/$/, "")}/checkout.html?plan=${encodeURIComponent(plan.data)}`);
    } catch (error) {
      if (error instanceof GoogleAccountConflictError) {
        return reply.code(409).send({ message: error.message });
      }
      const message = error instanceof Error ? error.message : "Gagal menyelesaikan login Google.";
      return reply.code(400).send({ message });
    }
  });

  app.get("/me", async (request, reply) => {
    const session = await getSession(request);
    if (!session) {
      return reply.code(401).send({ message: "Login diperlukan." });
    }

    const user = await findUserById(session.userId);
    if (!user) {
      clearSessionCookie(reply);
      return reply.code(401).send({ message: "Session tidak valid." });
    }

    return { user: mapAuthUser(user) };
  });

  app.post("/logout", async (request, reply) => {
    await revokeCurrentSession(request);
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.post("/sessions/revoke-all", async (request, reply) => {
    const session = await getSession(request);
    if (!session) {
      return reply.code(401).send({ message: "Login diperlukan." });
    }

    const revokedSessions = await revokeAllSessionsForUser(session.userId);
    clearSessionCookie(reply);
    return { ok: true, revokedSessions };
  });
}
