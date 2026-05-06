import {
  createRealtimeClientSecretRequestSchema,
  createRealtimeClientSecretResponseSchema,
  endInterviewRequestSchema,
  generateInterviewAnswerRequestSchema,
  generateInterviewAnswerResponseSchema,
  generateInterviewExplanationRequestSchema,
  generateInterviewExplanationResponseSchema,
  generateInterviewFollowupRequestSchema,
  generateInterviewFollowupResponseSchema,
  generateInterviewKeywordHelpRequestSchema,
  generateInterviewKeywordHelpResponseSchema,
  surfaceRealtimeKeywordsRequestSchema,
  surfaceRealtimeKeywordsResponseSchema,
  interviewRoundListResponseSchema,
  interviewRoundResponseSchema,
  startInterviewRequestSchema
} from "@interview-app/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../../env.js";
import { mapInterviewRound } from "./interview.mapper.js";
import {
  endInterviewForDevUser,
  getInterviewRoundsForDevUser,
  startInterviewForDevUser
} from "./interview.service.js";
import {
  generateInterviewAnswer,
  generateInterviewExplanation,
  generateInterviewFollowup,
  generateInterviewKeywordHelp,
  surfaceRealtimeKeywords
} from "./interview-ai.service.js";
import { createInterviewRealtimeClientSecret } from "./interview-realtime.service.js";

const applicationParamsSchema = z.object({
  applicationId: z.string().uuid()
});

const interviewParamsSchema = z.object({
  id: z.string().uuid()
});

export async function registerInterviewRoutes(app: FastifyInstance) {
  app.get("/application/:applicationId", async (request, reply) => {
    const params = applicationParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: "Invalid application id" });
    }

    const rounds = await getInterviewRoundsForDevUser(params.data.applicationId);
    return interviewRoundListResponseSchema.parse({
      interviewRounds: rounds.map(mapInterviewRound)
    });
  });

  app.post("/start", async (request, reply) => {
    const body = startInterviewRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ message: "Invalid interview payload" });
    }

    try {
      const { round, realtimeContext } = await startInterviewForDevUser(body.data);
      return reply.code(201).send(interviewRoundResponseSchema.parse({
        interviewRound: mapInterviewRound(round),
        realtimeContext
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to start interview";
      return reply.code(400).send({ message });
    }
  });

  app.post("/realtime/client-secret", async (request, reply) => {
    const body = createRealtimeClientSecretRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ message: "Invalid realtime client secret payload" });
    }

    try {
      const session = await createInterviewRealtimeClientSecret(body.data.realtimeContext);
      return createRealtimeClientSecretResponseSchema.parse(session);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create realtime client secret";
      return reply.code(400).send({ message });
    }
  });

  if (env.NODE_ENV !== "production") {
    // Dev/fallback harness only. Live interview runtime must use gpt-realtime-mini.
    app.post("/answer", async (request, reply) => {
      const body = generateInterviewAnswerRequestSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ message: "Invalid interview answer payload" });
      }

      const answer = await generateInterviewAnswer(body.data);
      return generateInterviewAnswerResponseSchema.parse(answer);
    });

    app.post("/followup", async (request, reply) => {
      const body = generateInterviewFollowupRequestSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ message: "Invalid interview follow-up payload" });
      }

      const followup = await generateInterviewFollowup(body.data);
      return generateInterviewFollowupResponseSchema.parse(followup);
    });

    app.post("/explain", async (request, reply) => {
      const body = generateInterviewExplanationRequestSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ message: "Invalid interview explanation payload" });
      }

      const explanation = await generateInterviewExplanation(body.data);
      return generateInterviewExplanationResponseSchema.parse(explanation);
    });

    app.post("/keyword-help", async (request, reply) => {
      const body = generateInterviewKeywordHelpRequestSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ message: "Invalid interview keyword help payload" });
      }

      const keywordHelp = await generateInterviewKeywordHelp(body.data);
      return generateInterviewKeywordHelpResponseSchema.parse(keywordHelp);
    });

    app.post("/runtime-keywords", async (request, reply) => {
      const body = surfaceRealtimeKeywordsRequestSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ message: "Invalid runtime keyword payload" });
      }

      const keywordResult = await surfaceRealtimeKeywords(body.data);
      return surfaceRealtimeKeywordsResponseSchema.parse(keywordResult);
    });
  }

  app.post("/:id/end", async (request, reply) => {
    const params = interviewParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: "Invalid interview id" });
    }

    const body = endInterviewRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ message: "Invalid end interview payload" });
    }

    const round = await endInterviewForDevUser(params.data.id, body.data);
    if (!round) {
      return reply.code(404).send({ message: "Interview round not found" });
    }

    return interviewRoundResponseSchema.parse({
      interviewRound: mapInterviewRound(round)
    });
  });
}
