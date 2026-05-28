export const realtimeActionNames = [
  "answer_qna",
  "answer_convo",
  "answer",
  "followup",
  "explain",
  "keyword",
  "ask"
] as const;

export type RealtimeActionName = typeof realtimeActionNames[number];
export type RealtimeConversationMode = "qna" | "convo" | "unknown";

export function isRealtimeActionName(value: unknown): value is RealtimeActionName {
  return typeof value === "string" && (realtimeActionNames as readonly string[]).includes(value);
}

export function getForcedConversationMode(action: RealtimeActionName): RealtimeConversationMode | undefined {
  if (action === "answer_qna") return "qna";
  if (action === "answer_convo") return "convo";
  return undefined;
}
