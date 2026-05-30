import {
  activeProfileDocumentResponseSchema,
  profileDocumentListResponseSchema,
  deleteProfileDocumentResponseSchema,
  retryProfileDocumentProcessingResponseSchema,
  setActiveProfileDocumentResponseSchema,
  uploadProfileDocumentResponseSchema
} from "@interview-app/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { mapProfileDocument } from "./profile-document.mapper.js";
import {
  getActiveProfileDocumentForDevUser,
  getProfileDocumentListForDevUser,
  deleteProfileDocumentForDevUser,
  retryProfileDocumentProcessingForDevUser,
  setActiveProfileDocumentForDevUser,
  uploadProfileDocumentForDevUser
} from "./profile-document.service.js";

const profileDocumentParamsSchema = z.object({
  id: z.string().uuid()
});

export async function registerProfileDocumentRoutes(app: FastifyInstance) {
  app.get("/list", async () => {
    const profileDocuments = await getProfileDocumentListForDevUser();
    return profileDocumentListResponseSchema.parse({
      profileDocuments: profileDocuments.map(mapProfileDocument)
    });
  });

  app.get("/active", async () => {
    const profileDocument = await getActiveProfileDocumentForDevUser();
    return activeProfileDocumentResponseSchema.parse({
      profileDocument: profileDocument ? mapProfileDocument(profileDocument) : null
    });
  });

  app.post("/upload", async (request, reply) => {
    const file = await request.file();
    if (!file) {
      return reply.code(400).send({ message: "Profile document file is required" });
    }

    try {
      const profileDocument = await uploadProfileDocumentForDevUser(file);
      return uploadProfileDocumentResponseSchema.parse({
        profileDocument: mapProfileDocument(profileDocument)
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to upload profile document";
      return reply.code(400).send({ message });
    }
  });

  app.post("/:id/set-active", async (request, reply) => {
    const params = profileDocumentParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: "Invalid profile document id" });
    }

    const profileDocument = await setActiveProfileDocumentForDevUser(params.data.id);
    if (!profileDocument) {
      return reply.code(404).send({ message: "Profile document not found" });
    }

    return setActiveProfileDocumentResponseSchema.parse({
      profileDocument: mapProfileDocument(profileDocument)
    });
  });

  app.post("/:id/retry-processing", async (request, reply) => {
    const params = profileDocumentParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: "Invalid profile document id" });
    }

    const profileDocument = await retryProfileDocumentProcessingForDevUser(params.data.id);
    if (!profileDocument) {
      return reply.code(404).send({ message: "Profile document not found" });
    }

    return retryProfileDocumentProcessingResponseSchema.parse({
      profileDocument: mapProfileDocument(profileDocument)
    });
  });

  app.delete("/:id", async (request, reply) => {
    const params = profileDocumentParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: "Invalid profile document id" });
    }

    try {
      const deletedProfileDocument = await deleteProfileDocumentForDevUser(params.data.id);
      if (!deletedProfileDocument) {
        return reply.code(404).send({ message: "Profile document not found" });
      }

      return deleteProfileDocumentResponseSchema.parse({
        ok: true,
        deletedProfileDocumentId: deletedProfileDocument.id
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete profile document";
      return reply.code(400).send({ message });
    }
  });
}
