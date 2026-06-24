import type { RealtimeContext } from "@interview-app/shared";
import type { ActionSpec } from "../../action-types.js";
import { formatMeetingContextForPrompt, meetingContextUsagePolicy } from "../shared/meeting-context-format.js";
import { buildMeetingResponsePolicyRules } from "./meeting-response-router.js";

export type GenerateMeetingAnswerInput = {
  meetingPrompt: string;
  realtimeContext: RealtimeContext;
};

export const generateMeetingAnswerSpec: ActionSpec<GenerateMeetingAnswerInput> = {
  actionId: "generate_meeting_response",
  version: "2026-05-27.v1",
  goal: "Membuat respons meeting online yang singkat, natural, aman, dan siap diucapkan user.",
  role: "Kamu adalah assistant respons meeting untuk user saat online meeting.",
  task: [
    "Baca latest meeting focus.",
    "Tentukan apakah konteks terbaru lebih cocok QnA mode atau Convo mode.",
    "Buat respons singkat yang bisa langsung diucapkan user.",
    "Pilih sumber konteks yang paling tepat: latest conversation, general knowledge, user profile, meeting context, atau gabungan yang aman.",
    "Jika konteks bisa direspons tanpa profil/session context, jawab langsung tanpa memaksakan data statis.",
    "Jika konteks membutuhkan data yang tidak tersedia, jangan mengarang; berikan respons aman dan sebutkan data yang perlu dicek."
  ].join("\n"),
  policyRules: [
    ...meetingContextUsagePolicy,
    ...buildMeetingResponsePolicyRules(),
    "Jangan mengklaim pengalaman, angka, tools, organisasi, atau pencapaian yang tidak ada di runtime context.",
    "Prioritaskan respons singkat yang siap diucapkan; QnA boleh 3-5 poin, Convo sebaiknya 2-4 poin natural.",
    "Jangan menghasilkan daftar pertanyaan follow-up untuk action respons, kecuali konteks terbaru atau user secara eksplisit meminta user bertanya."
  ],
  outputSchemaDescription: `Balas hanya dengan JSON valid:
{
  "status": "success | partial | insufficient_input | needs_human_review | failed_policy",
  "result": {
    "shouldAnswer": true | false,
    "answerDraft": "jawaban singkat siap diucapkan, sebaiknya berbentuk 3-5 poin",
    "keyPoints": ["maksimal 3 poin pendukung, pendek"],
    "followUpNote": "catatan singkat jika user perlu klarifikasi, boleh string kosong"
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
