import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../../env.js";
import { planSlugSchema } from "../payments/plan-catalog.js";
import { buildGoogleLoginUrl, exchangeGoogleCode, fetchGoogleUserInfo } from "./google-oauth.js";
import { findUserById, upsertGoogleUser } from "./auth.service.js";
import { clearSessionCookie, createOAuthState, getSession, parseOAuthState, setSessionCookie } from "./session.js";

const loginQuerySchema = z.object({
  plan: planSlugSchema
});

const callbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional()
});

export async function registerAuthRoutes(app: FastifyInstance) {
  app.get("/google/login", async (request, reply) => {
    const query = loginQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send({ message: "Paket yang dipilih tidak valid." });
    }

    try {
      const state = createOAuthState(query.data.plan);
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

    const state = parseOAuthState(query.data.state);
    const plan = planSlugSchema.safeParse(state?.plan);
    if (!state || !plan.success) {
      return reply.code(400).send({ message: "State login Google tidak valid atau sudah kedaluwarsa." });
    }

    try {
      const accessToken = await exchangeGoogleCode(query.data.code);
      const userInfo = await fetchGoogleUserInfo(accessToken);
      const user = await upsertGoogleUser(userInfo);
      setSessionCookie(reply, { userId: user.id, email: user.email });
      return reply.redirect(`${env.FRONTEND_BASE_URL.replace(/\/$/, "")}/checkout.html?plan=${encodeURIComponent(plan.data)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal menyelesaikan login Google.";
      return reply.code(400).send({ message });
    }
  });

  app.get("/me", async (request, reply) => {
    const session = getSession(request);
    if (!session) {
      return reply.code(401).send({ message: "Login diperlukan." });
    }

    const user = await findUserById(session.userId);
    if (!user) {
      clearSessionCookie(reply);
      return reply.code(401).send({ message: "Session tidak valid." });
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture
      }
    };
  });

  app.post("/logout", async (_request, reply) => {
    clearSessionCookie(reply);
    return { ok: true };
  });
}
