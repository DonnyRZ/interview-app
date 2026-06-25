import type { RealtimeContext } from "@interview-app/shared";
import type { ActionSpec } from "../../action-types.js";
import {
  meetingResponseCommonRules,
  meetingResponseJsonRules
} from "../response/meeting-response-common.js";
import { formatMeetingContextForPrompt, meetingContextUsagePolicy } from "../shared/meeting-context-format.js";

export type GenerateMeetingFollowupInput = {
  meetingPrompt: string;
  realtimeContext: RealtimeContext;
};

export const generateMeetingFollowupSpec: ActionSpec<GenerateMeetingFollowupInput> = {
  actionId: "generate_meeting_followup",
  version: "2026-05-27.v1",
  goal: "Membuat pertanyaan follow-up singkat yang relevan untuk membantu user melanjutkan online meeting.",
  role: "Kamu adalah assistant follow-up meeting untuk user saat online meeting.",
  task: [
    "Baca latest meeting focus.",
    "Buat 1-3 follow-up question singkat yang bisa ditanyakan user ke lawan bicara.",
    "Pilih sumber konteks yang paling tepat: latest conversation, general knowledge, user profile, meeting context, atau gabungan yang aman.",
    "Pastikan follow-up membantu memperjelas konteks, kriteria, constraint, prioritas, ownership, timeline, data, atau next step.",
    "Jika konteks terlalu umum atau kurang jelas, prioritaskan follow-up klarifikasi yang aman."
  ].join("\n"),
  policyRules: [
    ...meetingContextUsagePolicy,
    ...meetingResponseCommonRules,
    "Follow-up harus terdengar natural, profesional, dan siap diucapkan user.",
    "Jangan membuat follow-up yang terlalu panjang, defensif, atau terdengar seperti AI.",
    "Prioritaskan 1-3 pertanyaan singkat, masing-masing maksimal sekitar 18 kata.",
    "Jangan selalu mengaitkan follow-up ke user profile atau meeting context; gunakan hanya jika membantu dan aman.",
    ...meetingResponseJsonRules
  ],
  outputSchemaDescription: `Balas hanya dengan JSON valid:
{
  "status": "success | partial | insufficient_input | needs_human_review | failed_policy",
  "result": {
    "shouldFollowUp": true | false,
    "followUpQuestions": ["maksimal 3 pertanyaan singkat"],
    "followUpStrategy": "catatan singkat kapan follow-up ini dipakai"
  },
  "warnings": ["string"],
  "missingInputs": ["string"],
  "confidence": "low | medium | high",
  "evidence": [{ "field": "string", "source": "string", "quote": "string" }]
}`,
  buildContext: (input) => `Runtime payload:
- latestMeetingFocus:
${input.meetingPrompt.trim() || "unknown"}

${formatMeetingContextForPrompt(input.realtimeContext)}`
};
