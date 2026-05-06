import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import { sql } from "./db/client.js";
import { registerApplicationRoutes } from "./modules/applications/application.routes.js";
import { registerCvRoutes } from "./modules/cv/cv.routes.js";
import { registerHealthRoutes } from "./modules/health/health.routes.js";
import { registerInterviewRoutes } from "./modules/interviews/interview.routes.js";

export function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === "production" ? "info" : "debug"
    }
  });

  app.register(cors, {
    origin: true
  });

  app.register(multipart, {
    limits: {
      fileSize: 8 * 1024 * 1024,
      files: 1
    }
  });

  app.register(registerHealthRoutes);
  app.register(registerCvRoutes, { prefix: "/cv" });
  app.register(registerApplicationRoutes, { prefix: "/applications" });
  app.register(registerInterviewRoutes, { prefix: "/interviews" });

  app.addHook("onClose", async () => {
    await sql.end();
  });

  return app;
}
