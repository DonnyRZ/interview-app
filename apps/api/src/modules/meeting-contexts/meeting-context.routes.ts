import {
  meetingContextListResponseSchema,
  meetingContextResponseSchema,
  createMeetingContextRequestSchema,
  deleteMeetingContextResponseSchema,
  updateMeetingContextRequestSchema
} from "@interview-app/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ensureUserHasActiveSubscription, SubscriptionRequiredError } from "../auth/auth.service.js";
import { getRequestSession } from "../auth/request-session.js";
import { mapMeetingContext } from "./meeting-context.mapper.js";
import { safeClientError } from "../security/safe-error.js";
import {
  createMeetingContextForUser,
  deleteMeetingContextForUser,
  getMeetingContextForUser,
  getMeetingContextsForUser,
  updateMeetingContextForUser
} from "./meeting-context.service.js";

const meetingContextParamsSchema = z.object({
  id: z.string().uuid()
});
const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(10_000).default(0)
});

export async function registerMeetingContextRoutes(app: FastifyInstance) {
  app.get("/", async (request, reply) => {
    const session = await getRequestSession(request);
    if (!session) {
      return reply.code(401).send({ message: "Login diperlukan." });
    }

    const query = listQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send({ message: "Invalid pagination parameters" });
    }

    const meetingContexts = await getMeetingContextsForUser(session.userId, query.data);
    return meetingContextListResponseSchema.parse({
      meetingContexts: meetingContexts.map(mapMeetingContext)
    });
  });

  app.post("/", async (request, reply) => {
    const session = await getRequestSession(request);
    if (!session) {
      return reply.code(401).send({ message: "Login diperlukan." });
    }

    const body = createMeetingContextRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ message: "Invalid meetingContext payload" });
    }

    try {
      await ensureUserHasActiveSubscription(session.userId);
      const meetingContext = await createMeetingContextForUser(session.userId, body.data);
      return reply.code(201).send(meetingContextResponseSchema.parse({
        meetingContext: mapMeetingContext(meetingContext)
      }));
    } catch (error) {
      if (error instanceof SubscriptionRequiredError) {
        return reply.code(403).send({ message: error.message });
      }
      const message = safeClientError(error, "Meeting context tidak dapat dibuat.");
      return reply.code(400).send({ message });
    }
  });

  app.get("/:id", async (request, reply) => {
    const session = await getRequestSession(request);
    if (!session) {
      return reply.code(401).send({ message: "Login diperlukan." });
    }

    const params = meetingContextParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: "Invalid meetingContext id" });
    }

    const meetingContext = await getMeetingContextForUser(session.userId, params.data.id);
    if (!meetingContext) {
      return reply.code(404).send({ message: "MeetingContext not found" });
    }

    return meetingContextResponseSchema.parse({
      meetingContext: mapMeetingContext(meetingContext)
    });
  });

  app.patch("/:id", async (request, reply) => {
    const session = await getRequestSession(request);
    if (!session) {
      return reply.code(401).send({ message: "Login diperlukan." });
    }

    const params = meetingContextParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: "Invalid meetingContext id" });
    }

    const body = updateMeetingContextRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ message: "Invalid meetingContext payload" });
    }

    try {
      await ensureUserHasActiveSubscription(session.userId);
      const meetingContext = await updateMeetingContextForUser(session.userId, params.data.id, body.data);
      if (!meetingContext) {
        return reply.code(404).send({ message: "MeetingContext not found" });
      }

      return meetingContextResponseSchema.parse({
        meetingContext: mapMeetingContext(meetingContext)
      });
    } catch (error) {
      if (error instanceof SubscriptionRequiredError) {
        return reply.code(403).send({ message: error.message });
      }
      const message = safeClientError(error, "Meeting context tidak dapat diperbarui.");
      return reply.code(400).send({ message });
    }
  });

  app.delete("/:id", async (request, reply) => {
    const session = await getRequestSession(request);
    if (!session) {
      return reply.code(401).send({ message: "Login diperlukan." });
    }

    const params = meetingContextParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: "Invalid meetingContext id" });
    }

    const deletedMeetingContext = await deleteMeetingContextForUser(session.userId, params.data.id);
    if (!deletedMeetingContext) {
      return reply.code(404).send({ message: "MeetingContext not found" });
    }

    return deleteMeetingContextResponseSchema.parse({
      ok: true,
      deletedMeetingContextId: deletedMeetingContext.id
    });
  });
}
