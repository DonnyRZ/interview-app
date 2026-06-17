import {
  meetingContextListResponseSchema,
  meetingContextResponseSchema,
  createMeetingContextRequestSchema,
  deleteMeetingContextResponseSchema,
  updateMeetingContextRequestSchema
} from "@interview-app/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getSession } from "../auth/session.js";
import { mapMeetingContext } from "./meeting-context.mapper.js";
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

export async function registerMeetingContextRoutes(app: FastifyInstance) {
  app.get("/", async (request, reply) => {
    const session = getSession(request);
    if (!session) {
      return reply.code(401).send({ message: "Login diperlukan." });
    }

    const meetingContexts = await getMeetingContextsForUser(session.userId);
    return meetingContextListResponseSchema.parse({
      meetingContexts: meetingContexts.map(mapMeetingContext)
    });
  });

  app.post("/", async (request, reply) => {
    const session = getSession(request);
    if (!session) {
      return reply.code(401).send({ message: "Login diperlukan." });
    }

    const body = createMeetingContextRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ message: "Invalid meetingContext payload" });
    }

    try {
      const meetingContext = await createMeetingContextForUser(session.userId, body.data);
      return reply.code(201).send(meetingContextResponseSchema.parse({
        meetingContext: mapMeetingContext(meetingContext)
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create meetingContext";
      return reply.code(400).send({ message });
    }
  });

  app.get("/:id", async (request, reply) => {
    const session = getSession(request);
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
    const session = getSession(request);
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
      const meetingContext = await updateMeetingContextForUser(session.userId, params.data.id, body.data);
      if (!meetingContext) {
        return reply.code(404).send({ message: "MeetingContext not found" });
      }

      return meetingContextResponseSchema.parse({
        meetingContext: mapMeetingContext(meetingContext)
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update meetingContext";
      return reply.code(400).send({ message });
    }
  });

  app.delete("/:id", async (request, reply) => {
    const session = getSession(request);
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
