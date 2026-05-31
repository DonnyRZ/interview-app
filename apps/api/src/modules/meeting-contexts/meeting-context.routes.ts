import {
  meetingContextListResponseSchema,
  meetingContextResponseSchema,
  createMeetingContextRequestSchema,
  deleteMeetingContextResponseSchema,
  updateMeetingContextRequestSchema
} from "@interview-app/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { mapMeetingContext } from "./meeting-context.mapper.js";
import {
  createMeetingContextForDevUser,
  deleteMeetingContextForDevUser,
  getMeetingContextForDevUser,
  getMeetingContextsForDevUser,
  updateMeetingContextForDevUser
} from "./meeting-context.service.js";

const meetingContextParamsSchema = z.object({
  id: z.string().uuid()
});

export async function registerMeetingContextRoutes(app: FastifyInstance) {
  app.get("/", async () => {
    const meetingContexts = await getMeetingContextsForDevUser();
    return meetingContextListResponseSchema.parse({
      meetingContexts: meetingContexts.map(mapMeetingContext)
    });
  });

  app.post("/", async (request, reply) => {
    const body = createMeetingContextRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ message: "Invalid meetingContext payload" });
    }

    try {
      const meetingContext = await createMeetingContextForDevUser(body.data);
      return reply.code(201).send(meetingContextResponseSchema.parse({
        meetingContext: mapMeetingContext(meetingContext)
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create meetingContext";
      return reply.code(400).send({ message });
    }
  });

  app.get("/:id", async (request, reply) => {
    const params = meetingContextParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: "Invalid meetingContext id" });
    }

    const meetingContext = await getMeetingContextForDevUser(params.data.id);
    if (!meetingContext) {
      return reply.code(404).send({ message: "MeetingContext not found" });
    }

    return meetingContextResponseSchema.parse({
      meetingContext: mapMeetingContext(meetingContext)
    });
  });

  app.patch("/:id", async (request, reply) => {
    const params = meetingContextParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: "Invalid meetingContext id" });
    }

    const body = updateMeetingContextRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ message: "Invalid meetingContext payload" });
    }

    try {
      const meetingContext = await updateMeetingContextForDevUser(params.data.id, body.data);
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
    const params = meetingContextParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: "Invalid meetingContext id" });
    }

    const deletedMeetingContext = await deleteMeetingContextForDevUser(params.data.id);
    if (!deletedMeetingContext) {
      return reply.code(404).send({ message: "MeetingContext not found" });
    }

    return deleteMeetingContextResponseSchema.parse({
      ok: true,
      deletedMeetingContextId: deletedMeetingContext.id
    });
  });
}
