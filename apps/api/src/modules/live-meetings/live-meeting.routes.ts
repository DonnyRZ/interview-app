import {
  createRealtimeClientSecretRequestSchema,
  createRealtimeClientSecretResponseSchema,
  deleteLiveMeetingSessionResponseSchema,
  endLiveMeetingRequestSchema,
  generateMeetingAnswerRequestSchema,
  generateMeetingAnswerResponseSchema,
  generateMeetingExplanationRequestSchema,
  generateMeetingExplanationResponseSchema,
  generateMeetingFollowupRequestSchema,
  generateMeetingFollowupResponseSchema,
  generateMeetingKeywordHelpRequestSchema,
  generateMeetingKeywordHelpResponseSchema,
  surfaceRealtimeKeywordsRequestSchema,
  surfaceRealtimeKeywordsResponseSchema,
  liveMeetingSessionListResponseSchema,
  liveMeetingSessionResponseSchema,
  startLiveMeetingRequestSchema
} from "@interview-app/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../../env.js";
import { ensureUserHasActiveSubscription, SubscriptionRequiredError } from "../auth/auth.service.js";
import { getRequestSession } from "../auth/request-session.js";
import { mapLiveMeetingSession } from "./live-meeting.mapper.js";
import {
  deleteLiveMeetingSessionForUser,
  endLiveMeetingForUser,
  getLiveMeetingSessionsForUser,
  getRealtimeContextForLiveMeetingSessionForUser,
  startLiveMeetingForUser
} from "./live-meeting.service.js";
import {
  generateMeetingAnswer,
  generateMeetingExplanation,
  generateMeetingFollowup,
  generateMeetingKeywordHelp,
  surfaceRealtimeKeywords
} from "./live-meeting-ai.service.js";
import { createLiveMeetingRealtimeClientSecret } from "./live-meeting-realtime.service.js";

const meetingContextParamsSchema = z.object({
  meetingContextId: z.string().uuid()
});

const liveMeetingParamsSchema = z.object({
  id: z.string().uuid()
});

async function requireLiveMeetingAccess(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const session = await getRequestSession(request);
  if (!session) {
    await reply.code(401).send({ message: "Login diperlukan." });
    return null;
  }

  try {
    await ensureUserHasActiveSubscription(session.userId);
    return session;
  } catch (error) {
    if (error instanceof SubscriptionRequiredError) {
      await reply.code(403).send({ message: error.message });
      return null;
    }

    throw error;
  }
}

export async function registerLiveMeetingRoutes(app: FastifyInstance) {
  app.get("/meeting-context/:meetingContextId", async (request, reply) => {
    const session = await getRequestSession(request);
    if (!session) {
      return reply.code(401).send({ message: "Login diperlukan." });
    }

    const params = meetingContextParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: "Invalid meeting context id" });
    }

    const rounds = await getLiveMeetingSessionsForUser(session.userId, params.data.meetingContextId);
    if (!rounds) {
      return reply.code(404).send({ message: "Meeting context not found" });
    }

    return liveMeetingSessionListResponseSchema.parse({
      liveMeetingSessions: rounds.map(mapLiveMeetingSession)
    });
  });

  app.post("/start", async (request, reply) => {
    const session = await requireLiveMeetingAccess(request, reply);
    if (!session) {
      return;
    }

    const body = startLiveMeetingRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ message: "Invalid live meeting payload" });
    }

    try {
      const { session: liveMeetingSession, realtimeContext } = await startLiveMeetingForUser(
        session.userId,
        body.data
      );
      return reply.code(201).send(liveMeetingSessionResponseSchema.parse({
        liveMeetingSession: mapLiveMeetingSession(liveMeetingSession),
        realtimeContext
      }));
    } catch (error) {
      if (error instanceof SubscriptionRequiredError) {
        return reply.code(403).send({ message: error.message });
      }

      const message = error instanceof Error ? error.message : "Failed to start live meeting";
      return reply.code(400).send({ message });
    }
  });

  app.post("/realtime/client-secret", async (request, reply) => {
    const session = await requireLiveMeetingAccess(request, reply);
    if (!session) {
      return;
    }

    const body = createRealtimeClientSecretRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ message: "Invalid realtime client secret payload" });
    }

    try {
      const realtimeContext = await getRealtimeContextForLiveMeetingSessionForUser(
        session.userId,
        body.data.liveMeetingSessionId
      );
      if (!realtimeContext) {
        return reply.code(404).send({ message: "Live meeting session not found" });
      }

      const realtimeSession = await createLiveMeetingRealtimeClientSecret(realtimeContext);
      return createRealtimeClientSecretResponseSchema.parse(realtimeSession);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create realtime client secret";
      return reply.code(400).send({ message });
    }
  });

  if (env.NODE_ENV !== "production") {
    // Dev/fallback harness only. Live meeting runtime must use gpt-realtime-mini.
    app.post("/answer", async (request, reply) => {
      const session = await requireLiveMeetingAccess(request, reply);
      if (!session) {
        return;
      }

      const body = generateMeetingAnswerRequestSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ message: "Invalid meeting answer payload" });
      }

      const answer = await generateMeetingAnswer(body.data);
      return generateMeetingAnswerResponseSchema.parse(answer);
    });

    app.post("/followup", async (request, reply) => {
      const session = await requireLiveMeetingAccess(request, reply);
      if (!session) {
        return;
      }

      const body = generateMeetingFollowupRequestSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ message: "Invalid meeting follow-up payload" });
      }

      const followup = await generateMeetingFollowup(body.data);
      return generateMeetingFollowupResponseSchema.parse(followup);
    });

    app.post("/explain", async (request, reply) => {
      const session = await requireLiveMeetingAccess(request, reply);
      if (!session) {
        return;
      }

      const body = generateMeetingExplanationRequestSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ message: "Invalid meeting explanation payload" });
      }

      const explanation = await generateMeetingExplanation(body.data);
      return generateMeetingExplanationResponseSchema.parse(explanation);
    });

    app.post("/keyword-help", async (request, reply) => {
      const session = await requireLiveMeetingAccess(request, reply);
      if (!session) {
        return;
      }

      const body = generateMeetingKeywordHelpRequestSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ message: "Invalid meeting keyword help payload" });
      }

      const keywordHelp = await generateMeetingKeywordHelp(body.data);
      return generateMeetingKeywordHelpResponseSchema.parse(keywordHelp);
    });

    app.post("/runtime-keywords", async (request, reply) => {
      const session = await requireLiveMeetingAccess(request, reply);
      if (!session) {
        return;
      }

      const body = surfaceRealtimeKeywordsRequestSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ message: "Invalid runtime keyword payload" });
      }

      const keywordResult = await surfaceRealtimeKeywords(body.data);
      return surfaceRealtimeKeywordsResponseSchema.parse(keywordResult);
    });

  }

  app.post("/:id/end", async (request, reply) => {
    const session = await getRequestSession(request);
    if (!session) {
      return reply.code(401).send({ message: "Login diperlukan." });
    }

    const params = liveMeetingParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: "Invalid live meeting session id" });
    }

    const body = endLiveMeetingRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ message: "Invalid end meeting payload" });
    }

    const liveMeetingSession = await endLiveMeetingForUser(session.userId, params.data.id, body.data);
    if (!liveMeetingSession) {
      return reply.code(404).send({ message: "Live meeting session not found" });
    }

    return liveMeetingSessionResponseSchema.parse({
      liveMeetingSession: mapLiveMeetingSession(liveMeetingSession)
    });
  });

  app.delete("/:id", async (request, reply) => {
    const session = await getRequestSession(request);
    if (!session) {
      return reply.code(401).send({ message: "Login diperlukan." });
    }

    const params = liveMeetingParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: "Invalid live meeting session id" });
    }

    try {
      const deletedRound = await deleteLiveMeetingSessionForUser(session.userId, params.data.id);
      if (!deletedRound) {
        return reply.code(404).send({ message: "Live meeting session not found" });
      }

      return deleteLiveMeetingSessionResponseSchema.parse({
        ok: true,
        deletedLiveMeetingSessionId: deletedRound.id
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete live meeting session";
      return reply.code(400).send({ message });
    }
  });
}
