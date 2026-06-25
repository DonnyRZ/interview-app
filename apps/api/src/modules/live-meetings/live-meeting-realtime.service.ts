import type { RealtimeContext } from "@interview-app/shared";
import { env } from "../../env.js";
import {
  buildRealtimeMeetingSessionInstructions,
  buildRealtimeResponseInstructions
} from "../ai/actions/realtime/realtime-meeting-session.js";
import { buildRealtimeMeetingTranscriptionPrompt } from "../ai/actions/realtime/realtime-meeting-transcription.js";
import { createOpenAiRealtimeClientSecret } from "../ai/openai.client.js";

export async function createLiveMeetingRealtimeClientSecret(input: {
  userId: string;
  liveMeetingSessionId: string;
  realtimeContext: RealtimeContext;
}) {
  if (env.OPENAI_REALTIME_MODEL !== "gpt-realtime-mini") {
    throw new Error("Live meeting runtime only supports gpt-realtime-mini.");
  }

  const secret = await createOpenAiRealtimeClientSecret({
    userId: input.userId,
    liveMeetingSessionId: input.liveMeetingSessionId,
    instructions: buildRealtimeMeetingSessionInstructions(),
    transcriptionPrompt: buildRealtimeMeetingTranscriptionPrompt()
  });
  return {
    ...secret,
    responseInstructions: buildRealtimeResponseInstructions(input.realtimeContext)
  };
}
