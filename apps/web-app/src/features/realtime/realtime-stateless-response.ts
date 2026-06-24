import {
  buildRealtimeActionPrompt,
  type RealtimeActionPromptPayload
} from "@interview-app/shared/realtime-overlay";

export type RealtimeResponseOwnerKind = "help" | "keyword";

export type RealtimeResponseOwnership = {
  owner: RealtimeResponseOwnerKind;
  requestId: number;
};

export function buildStatelessRealtimeResponseCreate(input: {
  payload: RealtimeActionPromptPayload;
  instructions: string;
  maxOutputTokens: number;
  owner: RealtimeResponseOwnerKind;
  requestId: number;
}) {
  return {
    type: "response.create",
    response: {
      conversation: "none",
      metadata: {
        orviko_owner: input.owner,
        orviko_request_id: String(input.requestId)
      },
      instructions: input.instructions,
      input: [{
        type: "message",
        role: "user",
        content: [{
          type: "input_text",
          text: buildRealtimeActionPrompt(input.payload)
        }]
      }],
      output_modalities: ["text"],
      max_output_tokens: input.maxOutputTokens
    }
  };
}

export function getRealtimeResponseOwnership(event: Record<string, unknown>): RealtimeResponseOwnership | null {
  const response = event.response && typeof event.response === "object"
    ? event.response as Record<string, unknown>
    : null;
  const metadata = response?.metadata && typeof response.metadata === "object"
    ? response.metadata as Record<string, unknown>
    : null;
  const owner = metadata?.orviko_owner;
  const rawRequestId = metadata?.orviko_request_id;
  const requestId = typeof rawRequestId === "number"
    ? rawRequestId
    : typeof rawRequestId === "string" ? Number.parseInt(rawRequestId, 10) : Number.NaN;
  if ((owner !== "help" && owner !== "keyword") || !Number.isSafeInteger(requestId) || requestId < 1) {
    return null;
  }
  return { owner, requestId };
}

export function getRealtimeResponseUsage(event: Record<string, unknown>) {
  const response = event.response && typeof event.response === "object"
    ? event.response as Record<string, unknown>
    : null;
  return response?.usage && typeof response.usage === "object"
    ? response.usage as Record<string, unknown>
    : null;
}
