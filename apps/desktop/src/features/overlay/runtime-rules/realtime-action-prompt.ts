type RealtimeActionPromptPayload = {
  action: "answer" | "followup" | "explain" | "keyword" | "ask" | "surface_keywords";
  latestQuestion?: string;
  recentTranscript?: string;
  triggerText?: string;
};

export function buildRealtimeActionPrompt(payload: RealtimeActionPromptPayload) {
  return [
    `TRIGGER: ${getRealtimeTriggerName(payload.action)}`,
    "BEGIN_RUNTIME_DATA",
    payload.recentTranscript ? `Conversation window terbaru:\n${payload.recentTranscript}` : "",
    payload.latestQuestion ? `Latest conversation focus:\n${payload.latestQuestion}` : "",
    payload.triggerText ? `Input user/keyword:\n${payload.triggerText}` : "",
    "END_RUNTIME_DATA"
  ].filter(Boolean).join("\n");
}

function getRealtimeTriggerName(action: RealtimeActionPromptPayload["action"]) {
  if (action === "answer") return "BANTU_JAWAB";
  if (action === "followup") return "BANTU_FOLLOWUP";
  if (action === "explain") return "JELASKAN_MAKSUDNYA";
  if (action === "keyword") return "EXPLAIN_KEYWORD";
  if (action === "surface_keywords") return "SURFACE_KEYWORDS";
  return "ASK";
}
