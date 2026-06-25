import type { FastifyInstance } from "fastify";
import { env } from "../../env.js";

export function registerSecurityHeaders(app: FastifyInstance) {
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
    reply.header("Cross-Origin-Resource-Policy", "same-site");
    reply.header("Cache-Control", "no-store");
    if (env.NODE_ENV === "production") {
      reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    }
    return payload;
  });
}
