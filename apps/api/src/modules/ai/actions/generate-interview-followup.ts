import type { RealtimeContext } from "@interview-app/shared";
import type { ActionSpec } from "../action-types.js";

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
    "Pastikan follow-up membantu memperjelas scope, prioritas, data, metric, workflow, atau ekspektasi role.",
    "Jika pertanyaan interviewer terlalu umum atau konteks kurang jelas, prioritaskan follow-up klarifikasi yang aman."
  ].join("\n"),
  policyRules: [
    "Follow-up harus terdengar natural, profesional, dan siap diucapkan kandidat.",
    "Jangan membuat follow-up yang terlalu panjang, defensif, atau terdengar seperti AI.",
    "Jangan mengklaim pengalaman kandidat yang tidak ada di CV context.",
    "Prioritaskan 1-3 pertanyaan singkat, masing-masing maksimal sekitar 18 kata.",
    "Untuk topik teknis/domain, gunakan domainProfile sebagai boundary relevansi.",
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

- candidateContext:
  - summary: ${input.realtimeContext.candidateContext.summary || "unknown"}
  - readyContext: ${input.realtimeContext.candidateContext.readyContext || "unknown"}
  - skills: ${input.realtimeContext.candidateContext.skills.join(", ") || "none"}
  - relevantExperience: ${input.realtimeContext.candidateContext.relevantExperience.join(", ") || "none"}

- applicationContext:
  - companyName: ${input.realtimeContext.applicationContext.companyName}
  - roleTitle: ${input.realtimeContext.applicationContext.roleTitle}
  - jdSummary: ${input.realtimeContext.applicationContext.jdSummary || "unknown"}
  - roleRequirements: ${input.realtimeContext.applicationContext.roleRequirements.join(", ") || "none"}
  - interviewPrepThemes: ${input.realtimeContext.applicationContext.interviewPrepThemes.join(", ") || "none"}

- domainProfile:
  - primaryDomain: ${input.realtimeContext.domainProfile.primaryDomain || "unknown"}
  - nicheDescription: ${input.realtimeContext.domainProfile.nicheDescription || "unknown"}
  - inScopeConcepts: ${input.realtimeContext.domainProfile.inScopeConcepts.join(", ") || "none"}
  - outOfScopeConcepts: ${input.realtimeContext.domainProfile.outOfScopeConcepts.join(", ") || "none"}

- stageContext:
  - stageType: ${input.realtimeContext.stageContext.stageType}
  - focus: ${input.realtimeContext.stageContext.focus.join(", ") || "none"}`
};
