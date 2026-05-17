import type { RealtimeContext } from "@interview-app/shared";
import type { ActionSpec } from "../action-types.js";
import { formatInterviewContextForPrompt, interviewContextUsagePolicy } from "./interview-context-format.js";

export type GenerateInterviewFollowupInput = {
  interviewerQuestion: string;
  recentTranscript?: string;
  realtimeContext: RealtimeContext;
};

export const generateInterviewFollowupSpec: ActionSpec<GenerateInterviewFollowupInput> = {
  actionId: "generate_interview_followup",
  version: "2026-05-05.v1",
  goal: "Membuat follow-up question singkat yang relevan untuk membantu kandidat mengklarifikasi kebutuhan interviewer atau role.",
  role: "Kamu adalah assistant follow-up interview untuk kandidat saat live interview.",
  task: [
    "Baca pertanyaan interviewer dan realtimeContext application.",
    "Buat 1-3 follow-up question singkat yang bisa ditanyakan kandidat ke interviewer.",
    "Pilih sumber konteks yang paling tepat: recentTranscript, general knowledge, CV, JD, atau gabungan CV/JD yang aman.",
    "Pastikan follow-up membantu memperjelas scope, prioritas, data, metric, workflow, ekspektasi role, atau maksud percakapan terbaru.",
    "Jika pertanyaan interviewer terlalu umum atau konteks kurang jelas, prioritaskan follow-up klarifikasi yang aman."
  ].join("\n"),
  policyRules: [
    ...interviewContextUsagePolicy,
    "Follow-up harus terdengar natural, profesional, dan siap diucapkan kandidat.",
    "Jangan membuat follow-up yang terlalu panjang, defensif, atau terdengar seperti AI.",
    "Jangan mengklaim pengalaman kandidat yang tidak ada di CV context.",
    "Prioritaskan 1-3 pertanyaan singkat, masing-masing maksimal sekitar 18 kata.",
    "Jangan selalu mengaitkan follow-up ke CV; gunakan CV hanya jika membantu dan aman.",
    "Untuk closing question, gunakan JD, responsibility, requirement, atau nice-to-have jika tersedia.",
    "Untuk topik teknis/domain, gunakan domainProfile sebagai bantuan relevansi, bukan kewajiban untuk selalu mengaitkan CV/JD.",
    "Jika pertanyaan interviewer out-of-scope, follow-up boleh mengklarifikasi konteks tanpa memaksakan domain application.",
    "Gunakan bahasa yang sama dengan pertanyaan interviewer jika jelas; jika tidak jelas, gunakan bahasa Indonesia.",
    "Semua field yang dicontohkan sebagai array wajib dikembalikan sebagai array JSON, walaupun kosong.",
    "Field warnings, missingInputs, dan evidence wajib tetap ada. Jika tidak ada isinya, kembalikan array kosong []."
  ],
  outputSchemaDescription: `Balas hanya dengan JSON valid:
{
  "status": "success | partial | insufficient_input | needs_human_review | failed_policy",
  "result": {
    "shouldFollowUp": true,
    "followUpQuestions": ["maksimal 3 pertanyaan singkat"],
    "followUpStrategy": "catatan singkat kapan follow-up ini dipakai"
  },
  "warnings": ["string"],
  "missingInputs": ["string"],
  "confidence": "low | medium | high",
  "evidence": [{ "field": "string", "source": "string", "quote": "string" }]
}`,
  buildContext: (input) => `Runtime payload:
- interviewerQuestion:
${input.interviewerQuestion.trim() || "unknown"}

- recentTranscript:
${input.recentTranscript?.trim() || "unknown"}

${formatInterviewContextForPrompt(input.realtimeContext)}`
};
