import { meetingConvoAntiPatternRules } from "./meeting-convo-anti-patterns.js";
import { meetingConvoIntentRules } from "./meeting-convo-intent.js";
import { meetingConvoResponseFormatRules } from "./meeting-convo-response-format.js";
import { meetingConvoResponseShapes } from "./meeting-convo-response-shapes.js";

export const meetingConvoModeRules = [
  ...meetingConvoIntentRules,
  ...meetingConvoResponseShapes,
  ...meetingConvoResponseFormatRules,
  ...meetingConvoAntiPatternRules
];

export const meetingConvoRealtimeActionFormatRules = [
  "TANGGAPI and legacy BANTU_JAWAB + Convo mode: produce a ready-to-say response, not an answer to an imaginary question.",
  "TANGGAPI and legacy BANTU_JAWAB + Convo mode: follow acknowledge -> useful angle -> optional light next step.",
  "TANGGAPI and legacy BANTU_JAWAB + Convo mode: do not output follow-up questions by default; those belong to BANTU_FOLLOWUP.",
  "TANGGAPI and legacy BANTU_JAWAB + Convo mode: do not include question marks.",
  "TANGGAPI and legacy BANTU_JAWAB + Convo mode: do not ask the other speaker or the user anything.",
  "TANGGAPI and legacy BANTU_JAWAB + Convo mode: do not use the word 'apakah' or start bullets with 'Langkah', 'Mungkin', or 'Ada baiknya'.",
  "TANGGAPI and legacy BANTU_JAWAB + Convo mode: self-check before final output; rewrite any bullet that starts with 'Langkah', 'Mungkin', or 'Ada baiknya'.",
  "TANGGAPI and legacy BANTU_JAWAB + Convo mode: do not turn one observation into trend, market, industry, or global claims unless runtime data explicitly says so.",
  "TANGGAPI and legacy BANTU_JAWAB + Convo mode: use 2-4 concise bullets that sound natural in a meeting.",
  "TANGGAPI and legacy BANTU_JAWAB + Convo mode: return bullets only, with no unbulleted intro or closing paragraph.",
  "TANGGAPI and legacy BANTU_JAWAB + Convo mode: every output line must start with '- '; do not use • or any other bullet marker."
];
