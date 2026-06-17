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
import { getSession } from "../auth/session.js";
import { mapProfileDocument } from "./profile-document.mapper.js";
import {
  getActiveProfileDocumentForUser,
  getProfileDocumentListForUser,
  deleteProfileDocumentForUser,
  retryProfileDocumentProcessingForUser,
  setActiveProfileDocumentForUser,
  uploadProfileDocumentForUser
} from "./profile-document.service.js";

const profileDocumentParamsSchema = z.object({
  id: z.string().uuid()
});

export async function registerProfileDocumentRoutes(app: FastifyInstance) {
  app.get("/list", async (request, reply) => {
    const session = getSession(request);
    if (!session) {
      return reply.code(401).send({ message: "Login diperlukan." });
    }

    const profileDocuments = await getProfileDocumentListForUser(session.userId);
    return profileDocumentListResponseSchema.parse({
      profileDocuments: profileDocuments.map(mapProfileDocument)
    });
  });

  app.get("/active", async (request, reply) => {
    const session = getSession(request);
    if (!session) {
      return reply.code(401).send({ message: "Login diperlukan." });
    }

    const profileDocument = await getActiveProfileDocumentForUser(session.userId);
    return activeProfileDocumentResponseSchema.parse({
      profileDocument: profileDocument ? mapProfileDocument(profileDocument) : null
    });
  });

  app.post("/upload", async (request, reply) => {
    const session = getSession(request);
    if (!session) {
      return reply.code(401).send({ message: "Login diperlukan." });
    }

    const file = await request.file();
    if (!file) {
      return reply.code(400).send({ message: "Profile document file is required" });
    }

    try {
      const profileDocument = await uploadProfileDocumentForUser(session.userId, file);
      return uploadProfileDocumentResponseSchema.parse({
        profileDocument: mapProfileDocument(profileDocument)
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to upload profile document";
      return reply.code(400).send({ message });
    }
  });

  app.post("/:id/set-active", async (request, reply) => {
    const session = getSession(request);
    if (!session) {
      return reply.code(401).send({ message: "Login diperlukan." });
    }

    const params = profileDocumentParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: "Invalid profile document id" });
    }

    const profileDocument = await setActiveProfileDocumentForUser(session.userId, params.data.id);
    if (!profileDocument) {
      return reply.code(404).send({ message: "Profile document not found" });
    }

    return setActiveProfileDocumentResponseSchema.parse({
      profileDocument: mapProfileDocument(profileDocument)
    });
  });

  app.post("/:id/retry-processing", async (request, reply) => {
    const session = getSession(request);
    if (!session) {
      return reply.code(401).send({ message: "Login diperlukan." });
    }

    const params = profileDocumentParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: "Invalid profile document id" });
    }

    const profileDocument = await retryProfileDocumentProcessingForUser(session.userId, params.data.id);
    if (!profileDocument) {
      return reply.code(404).send({ message: "Profile document not found" });
    }

    return retryProfileDocumentProcessingResponseSchema.parse({
      profileDocument: mapProfileDocument(profileDocument)
    });
  });

  app.delete("/:id", async (request, reply) => {
    const session = getSession(request);
    if (!session) {
      return reply.code(401).send({ message: "Login diperlukan." });
    }

    const params = profileDocumentParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: "Invalid profile document id" });
    }

    try {
      const deletedProfileDocument = await deleteProfileDocumentForUser(session.userId, params.data.id);
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
