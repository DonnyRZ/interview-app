export type RealtimeActionName =
  | "answer_qna"
  | "answer_convo"
  | "answer"
  | "followup"
  | "explain"
  | "explain_text"
  | "keyword";

export type RealtimeConversationMode = "qna" | "convo" | "unknown";

export function isConversationHelpActionName(action: string) {
  return action === "answer_qna"
    || action === "answer_convo"
    || action === "answer"
    || action === "followup"
    || action === "explain"
    || action === "keyword";
}

export function getExplicitActionConversationMode(action: string): RealtimeConversationMode | undefined {
  if (action === "answer_qna") return "qna";
  if (action === "answer_convo") return "convo";
  return undefined;
}
