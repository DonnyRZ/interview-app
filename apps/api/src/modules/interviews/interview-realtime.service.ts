import type { RealtimeContext } from "@interview-app/shared";
import { env } from "../../env.js";
import { buildRealtimeInterviewSessionInstructions } from "../ai/actions/realtime-interview-session.js";
import { buildRealtimeInterviewTranscriptionPrompt } from "../ai/actions/realtime-interview-transcription.js";
import { createOpenAiRealtimeClientSecret } from "../ai/openai.client.js";

export async function createInterviewRealtimeClientSecret(realtimeContext: RealtimeContext) {
  if (env.OPENAI_REALTIME_MODEL !== "gpt-realtime-mini") {
    throw new Error("Live interview runtime only supports gpt-realtime-mini.");
  }

  return createOpenAiRealtimeClientSecret({
    instructions: buildRealtimeInterviewSessionInstructions(realtimeContext),
    transcriptionPrompt: buildRealtimeInterviewTranscriptionPrompt()
  });
}
