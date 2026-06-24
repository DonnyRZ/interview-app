import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import { sql } from "./db/client.js";
import { corsAllowedOrigins } from "./env.js";
import { registerAuthRoutes } from "./modules/auth/auth.routes.js";
import { registerMeetingContextRoutes } from "./modules/meeting-contexts/meeting-context.routes.js";
import { registerPaymentRoutes } from "./modules/payments/payment.routes.js";
import { registerProfileDocumentRoutes } from "./modules/profile-documents/profile-document.routes.js";
import { registerHealthRoutes } from "./modules/health/health.routes.js";
import { registerLiveMeetingRoutes } from "./modules/live-meetings/live-meeting.routes.js";

export function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === "production" ? "info" : "debug"
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

  app.register(registerHealthRoutes);
  app.register(registerAuthRoutes, { prefix: "/auth" });
  app.register(registerPaymentRoutes, { prefix: "/payments" });
  app.register(registerProfileDocumentRoutes, { prefix: "/profile-documents" });
  app.register(registerMeetingContextRoutes, { prefix: "/meeting-contexts" });
  app.register(registerLiveMeetingRoutes, { prefix: "/live-meetings" });

  app.addHook("onClose", async () => {
    await sql.end();
  });

  return app;
}
