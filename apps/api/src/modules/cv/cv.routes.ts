import {
  activeCvResponseSchema,
  cvListResponseSchema,
  deleteCvResponseSchema,
  retryCvProcessingResponseSchema,
  setActiveCvResponseSchema,
  uploadCvResponseSchema
} from "@interview-app/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { mapCv } from "./cv.mapper.js";
import {
  getActiveCvForDevUser,
  getCvListForDevUser,
  deleteCvForDevUser,
  retryCvProcessingForDevUser,
  setActiveCvForDevUser,
  uploadCvForDevUser
} from "./cv.service.js";

const cvParamsSchema = z.object({
  id: z.string().uuid()
});

export async function registerCvRoutes(app: FastifyInstance) {
  app.get("/list", async () => {
    const cvs = await getCvListForDevUser();
    return cvListResponseSchema.parse({
      cvs: cvs.map(mapCv)
    });
  });

  app.get("/active", async () => {
    const cv = await getActiveCvForDevUser();
    return activeCvResponseSchema.parse({
      cv: cv ? mapCv(cv) : null
    });
  });

  app.post("/upload", async (request, reply) => {
    const file = await request.file();
    if (!file) {
      return reply.code(400).send({ message: "CV file is required" });
    }

    try {
      const cv = await uploadCvForDevUser(file);
      return uploadCvResponseSchema.parse({
        cv: mapCv(cv)
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to upload CV";
      return reply.code(400).send({ message });
    }
  });

  app.post("/:id/set-active", async (request, reply) => {
    const params = cvParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: "Invalid CV id" });
    }

    const cv = await setActiveCvForDevUser(params.data.id);
    if (!cv) {
      return reply.code(404).send({ message: "CV not found" });
    }

    return setActiveCvResponseSchema.parse({
      cv: mapCv(cv)
    });
  });

  app.post("/:id/retry-processing", async (request, reply) => {
    const params = cvParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: "Invalid CV id" });
    }

    const cv = await retryCvProcessingForDevUser(params.data.id);
    if (!cv) {
      return reply.code(404).send({ message: "CV not found" });
    }

    return retryCvProcessingResponseSchema.parse({
      cv: mapCv(cv)
    });
  });

  app.delete("/:id", async (request, reply) => {
    const params = cvParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: "Invalid CV id" });
    }

    try {
      const deletedCv = await deleteCvForDevUser(params.data.id);
      if (!deletedCv) {
        return reply.code(404).send({ message: "CV not found" });
      }

      return deleteCvResponseSchema.parse({
        ok: true,
        deletedCvId: deletedCv.id
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete CV";
      return reply.code(400).send({ message });
    }
  });
}
