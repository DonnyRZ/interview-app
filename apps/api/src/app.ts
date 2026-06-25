import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import { sql } from "./db/client.js";
import { corsAllowedOrigins } from "./env.js";
import { registerAccountRoutes } from "./modules/account/account.routes.js";
import { registerAuthRoutes } from "./modules/auth/auth.routes.js";
import { registerMeetingContextRoutes } from "./modules/meeting-contexts/meeting-context.routes.js";
import { registerPaymentRoutes } from "./modules/payments/payment.routes.js";
import { registerProfileDocumentRoutes } from "./modules/profile-documents/profile-document.routes.js";
import { registerHealthRoutes } from "./modules/health/health.routes.js";
import { registerLiveMeetingRoutes } from "./modules/live-meetings/live-meeting.routes.js";
import { registerRateLimitGuard } from "./modules/security/rate-limit.js";
import { registerOperationsRoutes } from "./modules/operations/operations.routes.js";
import { registerSecurityHeaders } from "./modules/security/security-headers.js";

export function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === "production" ? "info" : "debug",
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "req.headers.x-orviko-lynk-webhook-secret",
          "headers.authorization",
          "headers.cookie",
          "headers.x-orviko-lynk-webhook-secret",
          "payload",
          "rawPayload",
          "*.customerEmail",
          "*.email",
          "*.providerTransactionId",
          "*.providerEventId"
        ],
        censor: "[redacted]"
      }
    }
  });

  app.register(cors, {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      let normalizedOrigin: string;
      try {
        normalizedOrigin = new URL(origin).origin;
      } catch {
        callback(null, false);
        return;
      }

      callback(null, corsAllowedOrigins.has(normalizedOrigin));
    },
    credentials: true
  });

  app.register(multipart, {
    limits: {
      fileSize: 8 * 1024 * 1024,
      files: 1
    }
  });

  registerRateLimitGuard(app);
  registerSecurityHeaders(app);

  app.register(registerHealthRoutes);
  app.register(registerAuthRoutes, { prefix: "/auth" });
  app.register(registerAccountRoutes, { prefix: "/account" });
  app.register(registerPaymentRoutes, { prefix: "/payments" });
  app.register(registerProfileDocumentRoutes, { prefix: "/profile-documents" });
  app.register(registerMeetingContextRoutes, { prefix: "/meeting-contexts" });
  app.register(registerLiveMeetingRoutes, { prefix: "/live-meetings" });
  app.register(registerOperationsRoutes, { prefix: "/internal" });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ error }, "Unhandled request error");
    const candidateStatusCode = typeof error === "object"
      && error !== null
      && "statusCode" in error
      && typeof error.statusCode === "number"
      ? error.statusCode
      : undefined;
    const statusCode = candidateStatusCode && candidateStatusCode >= 400 && candidateStatusCode < 500
      ? candidateStatusCode
      : 500;
    return reply.code(statusCode).send({
      message: statusCode === 500 ? "Terjadi gangguan internal. Silakan coba lagi." : "Request tidak dapat diproses."
    });
  });

  app.addHook("onClose", async () => {
    await sql.end();
  });

  return app;
}
