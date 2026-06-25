import { meetingQnaActionRules } from "./meeting-qna-action-rules.js";
import { meetingQnaAnswerFormatRules } from "./meeting-qna-answer-format.js";
import { meetingQnaIntentRules } from "./meeting-qna-intent.js";

export const meetingQnaModeRules = [
  ...meetingQnaIntentRules,
  ...meetingQnaAnswerFormatRules,
  ...meetingQnaActionRules
];

export const meetingQnaRealtimeActionFormatRules = [
  "JAWAB_PERTANYAAN and legacy answer action + QnA mode: produce a ready-to-say first-person answer in 2-4 concise bullets.",
  "JAWAB_PERTANYAAN and legacy answer action + QnA mode: the response must start with '- ' and every output line must be a bullet.",
  "JAWAB_PERTANYAAN and legacy answer action + QnA mode: do not output any acknowledgement, intro, role/persona framing, explanation of the format, or closing sentence.",
  "JAWAB_PERTANYAAN and legacy answer action + QnA mode: choose direct answer, structured reasoning, trade-off, clarification, or next-step proposal based on the question.",
  "JAWAB_PERTANYAAN and legacy answer action + QnA mode: if data is missing, say the safe answer and what must be checked."
];
