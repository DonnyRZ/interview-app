import { meetingQnaActionRules } from "./meeting-qna-action-rules.js";
import { meetingQnaAnswerFormatRules } from "./meeting-qna-answer-format.js";
import { meetingQnaIntentRules } from "./meeting-qna-intent.js";

export const meetingQnaModeRules = [
  ...meetingQnaIntentRules,
  ...meetingQnaAnswerFormatRules,
  ...meetingQnaActionRules
];

export const meetingQnaRealtimeActionFormatRules = [
  "JAWAB_PERTANYAAN and legacy answer action + QnA mode: produce a ready-to-say first-person answer in 3-5 concise bullets.",
  "JAWAB_PERTANYAAN and legacy answer action + QnA mode: choose direct answer, structured reasoning, trade-off, clarification, or next-step proposal based on the question.",
  "JAWAB_PERTANYAAN and legacy answer action + QnA mode: if data is missing, say the safe answer and what must be checked."
];
