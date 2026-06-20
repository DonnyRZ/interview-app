import type { RealtimeActionName, RealtimeConversationMode } from "./realtime-action-types.js";

type RealtimeActionPromptPayload = {
  action: RealtimeActionName | "surface_keywords";
  latestQuestion?: string;
  recentTranscript?: string;
  triggerText?: string;
  conversationMode?: RealtimeConversationMode;
};

export function buildRealtimeActionPrompt(payload: RealtimeActionPromptPayload) {
  const explanationSource = getExplanationSource(payload.action);
  return [
    `TRIGGER: ${getRealtimeTriggerName(payload)}`,
    explanationSource ? `EXPLANATION_SOURCE: ${explanationSource}` : "",
    "BEGIN_RUNTIME_DATA",
    payload.conversationMode ? `Conversation mode hint:\n${payload.conversationMode}` : "",
    payload.recentTranscript ? `Conversation window terbaru:\n${payload.recentTranscript}` : "",
    payload.latestQuestion ? `Latest conversation focus:\n${payload.latestQuestion}` : "",
    payload.action === "explain_text" && payload.triggerText
      ? `Explanation subject from user:\n${payload.triggerText}`
      : payload.triggerText ? `Input user/keyword:\n${payload.triggerText}` : "",
    "END_RUNTIME_DATA"
  ].filter(Boolean).join("\n");
}

function getExplanationSource(action: RealtimeActionPromptPayload["action"]) {
  if (action === "explain_text") return "USER_TEXT";
  if (action === "explain") return "LATEST_TRANSCRIPT";
  return undefined;
}

function getRealtimeTriggerName(payload: RealtimeActionPromptPayload) {
  const action = payload.action;
  if (action === "answer_qna") return "JAWAB_PERTANYAAN";
  if (action === "answer_convo") return "TANGGAPI";
  if (action === "answer") return payload.conversationMode === "convo" ? "TANGGAPI" : "JAWAB_PERTANYAAN";
  if (action === "followup") return "BANTU_FOLLOWUP";
  if (action === "explain" || action === "explain_text") return "JELASKAN_MAKSUDNYA";
  if (action === "keyword") return "EXPLAIN_KEYWORD";
  if (action === "surface_keywords") return "SURFACE_KEYWORDS";
  const unsupportedAction: never = action;
  throw new Error(`Unsupported realtime action: ${String(unsupportedAction)}`);
}
