import {
  meetingResponseCommonRules,
  meetingResponseJsonRules
} from "./meeting-response-common.js";
import {
  meetingConvoModeRules,
  meetingConvoRealtimeActionFormatRules
} from "./convo/meeting-convo-mode.js";
import {
  meetingQnaModeRules,
  meetingQnaRealtimeActionFormatRules
} from "./qna/meeting-qna-mode.js";

export const explicitAnswerTriggerRules = [
  "Explicit live triggers are final: JAWAB_PERTANYAAN must use QnA mode rules, and TANGGAPI must use Convo mode rules.",
  "Do not override JAWAB_PERTANYAAN or TANGGAPI based on transcript shape, punctuation, inferred intent, or conversationMode.",
  "JAWAB_PERTANYAAN applies QnA mode rules and QnA response format.",
  "TANGGAPI applies Convo mode rules and Convo response format."
];

export const legacyResponseRoutingRules = [
  "Legacy BANTU_JAWAB and non-live meeting response may classify the latest accepted meeting context as qna, convo, or unknown using transcript evidence and the conversationMode hint.",
  "For legacy BANTU_JAWAB only, treat conversationMode as a hint, not as truth; correct it when the latest transcript clearly points to another mode.",
  "For legacy BANTU_JAWAB only, if the mode is qna, apply only QnA response behavior; if the mode is convo, apply only Convo response behavior.",
  "For legacy BANTU_JAWAB only, if the mode is unknown and the latest context is a meaningful statement, topic, headline, update, report, observation, or concern without a clear request for the user to answer, route to Convo.",
  "If the mode is unknown and the latest context clearly asks the user to answer, decide, explain, clarify, or commit, route to QnA.",
  "If the mode is still unclear, prefer a brief Convo acknowledgement over inventing a QnA task."
];

export function buildMeetingResponsePolicyRules() {
  return [
    ...meetingResponseCommonRules,
    ...legacyResponseRoutingRules,
    "QnA mode rules:",
    ...meetingQnaModeRules,
    "Convo mode rules:",
    ...meetingConvoModeRules,
    ...meetingResponseJsonRules
  ];
}

export function buildRealtimeMeetingResponseSections() {
  return [
    "Explicit answer trigger routing:",
    ...explicitAnswerTriggerRules.map((rule) => `- ${rule}`),
    "",
    "QnA mode rules:",
    ...meetingQnaModeRules.map((rule) => `- ${rule}`),
    "",
    "Convo mode rules:",
    ...meetingConvoModeRules.map((rule) => `- ${rule}`),
    "",
    "Explicit answer trigger formats:",
    "- JAWAB_PERTANYAAN: apply QnA mode rules and QnA response format.",
    "- TANGGAPI: apply Convo mode rules and Convo response format.",
    "",
    "Legacy BANTU_JAWAB routing:",
    ...legacyResponseRoutingRules.map((rule) => `- ${rule}`),
    "",
    "Legacy BANTU_JAWAB mode-specific formats:",
    ...meetingQnaRealtimeActionFormatRules.map((rule) => `- ${rule}`),
    ...meetingConvoRealtimeActionFormatRules.map((rule) => `- ${rule}`)
  ];
}
