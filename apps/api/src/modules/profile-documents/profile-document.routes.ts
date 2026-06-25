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
import { ensureUserHasActiveSubscription, SubscriptionRequiredError } from "../auth/auth.service.js";
import { getRequestSession } from "../auth/request-session.js";
import { mapProfileDocument } from "./profile-document.mapper.js";
import { safeClientError } from "../security/safe-error.js";
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
const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(10_000).default(0)
});

async function requireProfileDocumentEntitlement(userId: string) {
  try {
    await ensureUserHasActiveSubscription(userId);
  } catch (error) {
    if (error instanceof SubscriptionRequiredError) {
      throw error;
    }
    throw error;
  }
}

export async function registerProfileDocumentRoutes(app: FastifyInstance) {
  app.get("/list", async (request, reply) => {
    const session = await getRequestSession(request);
    if (!session) {
      return reply.code(401).send({ message: "Login diperlukan." });
    }

    const query = listQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send({ message: "Invalid pagination parameters" });
    }

    const profileDocuments = await getProfileDocumentListForUser(session.userId, query.data);
    return profileDocumentListResponseSchema.parse({
      profileDocuments: profileDocuments.map(mapProfileDocument)
    });
  });

  app.get("/active", async (request, reply) => {
    const session = await getRequestSession(request);
    if (!session) {
      return reply.code(401).send({ message: "Login diperlukan." });
    }

    const profileDocument = await getActiveProfileDocumentForUser(session.userId);
    return activeProfileDocumentResponseSchema.parse({
      profileDocument: profileDocument ? mapProfileDocument(profileDocument) : null
    });
  });

  app.post("/upload", async (request, reply) => {
    const session = await getRequestSession(request);
    if (!session) {
      return reply.code(401).send({ message: "Login diperlukan." });
    }

    const file = await request.file();
    if (!file) {
      return reply.code(400).send({ message: "Profile document file is required" });
    }

    try {
      await requireProfileDocumentEntitlement(session.userId);
      const profileDocument = await uploadProfileDocumentForUser(session.userId, file);
      return uploadProfileDocumentResponseSchema.parse({
        profileDocument: mapProfileDocument(profileDocument)
      });
    } catch (error) {
      if (error instanceof SubscriptionRequiredError) {
        return reply.code(403).send({ message: error.message });
      }
      const message = safeClientError(error, "Profile document tidak dapat diunggah.");
      return reply.code(400).send({ message });
    }
  });

  app.post("/:id/set-active", async (request, reply) => {
    const session = await getRequestSession(request);
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
    const session = await getRequestSession(request);
    if (!session) {
      return reply.code(401).send({ message: "Login diperlukan." });
    }

    const params = profileDocumentParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: "Invalid profile document id" });
    }

    try {
      await requireProfileDocumentEntitlement(session.userId);
      const profileDocument = await retryProfileDocumentProcessingForUser(session.userId, params.data.id);
      if (!profileDocument) {
        return reply.code(404).send({ message: "Profile document not found" });
      }

      return retryProfileDocumentProcessingResponseSchema.parse({
        profileDocument: mapProfileDocument(profileDocument)
      });
    } catch (error) {
      if (error instanceof SubscriptionRequiredError) {
        return reply.code(403).send({ message: error.message });
      }
      const message = safeClientError(error, "Pemrosesan profile document tidak dapat diulang.");
      return reply.code(400).send({ message });
    }
  });

  app.delete("/:id", async (request, reply) => {
    const session = await getRequestSession(request);
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
      const message = safeClientError(error, "Profile document tidak dapat dihapus.");
      return reply.code(400).send({ message });
    }
  });
}
