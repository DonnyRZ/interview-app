import type { RealtimeContext } from "@interview-app/shared";
import type { ActionSpec } from "../action-types.js";

export type GenerateInterviewAnswerInput = {
  interviewerQuestion: string;
  recentTranscript?: string;
  realtimeContext: RealtimeContext;
};

export const generateInterviewAnswerSpec: ActionSpec<GenerateInterviewAnswerInput> = {
  actionId: "generate_interview_answer",
  version: "2026-05-05.v1",
  goal: "Membuat draft jawaban interview yang singkat, natural, dan sesuai konteks kandidat serta application.",
  role: "Kamu adalah assistant jawaban interview untuk kandidat saat live interview.",
  task: [
    "Baca pertanyaan interviewer dan realtimeContext application.",
    "Buat jawaban singkat yang bisa langsung diucapkan kandidat.",
    "Hubungkan jawaban dengan pengalaman kandidat, role, JD, dan domain/niche jika relevan.",
    "Jika pertanyaan cocok dengan outOfScopeConcepts, jawab secara umum dan profesional tanpa memaksakan domain/niche application.",
    "Jika pertanyaan belum jelas atau konteks tidak cukup, jangan mengarang; berikan jawaban klarifikasi yang aman."
  ].join("\n"),
  policyRules: [
    "Jawaban harus terdengar seperti kandidat manusia, bukan seperti AI atau naskah panjang.",
    "Jangan mengklaim pengalaman, angka, tools, company, atau pencapaian yang tidak ada di CV context.",
    "Jika informasi CV tidak cukup, gunakan framing umum yang jujur dan tandai missingInputs.",
    "Prioritaskan jawaban 2-3 kalimat, maksimal sekitar 65 kata.",
    "Untuk pertanyaan teknis/domain, gunakan domainProfile sebagai boundary relevansi.",
    "Jika pertanyaan interviewer tidak relevan dengan role/JD, tetap jawab secara profesional tanpa memaksakan keyword domain.",
    "Jika pertanyaan membahas konsep out-of-scope, jangan mengaitkannya ke company, domain application, atau niche lain kecuali interviewer menyebutnya eksplisit.",
    "Untuk kasus out-of-scope, aturan ini berlaku untuk semua field output: answerDraft, keyPoints, followUpNote, warnings, dan evidence.",
    "Jangan menyebut companyName, primaryDomain, inScopeConcepts, atau seedConcepts pada output out-of-scope kecuali muncul eksplisit di pertanyaan interviewer.",
    "Gunakan bahasa yang sama dengan pertanyaan interviewer jika jelas; jika tidak jelas, gunakan bahasa Indonesia.",
    "Semua field yang dicontohkan sebagai array wajib dikembalikan sebagai array JSON, walaupun kosong.",
    "Field warnings, missingInputs, dan evidence wajib tetap ada. Jika tidak ada isinya, kembalikan array kosong []."
  ],
  outputSchemaDescription: `Balas hanya dengan JSON valid:
{
  "status": "success | partial | insufficient_input | needs_human_review | failed_policy",
  "result": {
    "shouldAnswer": true,
    "answerDraft": "jawaban singkat siap diucapkan, maksimal 65 kata",
    "keyPoints": ["maksimal 3 poin pendukung, pendek"],
    "followUpNote": "catatan singkat jika kandidat perlu klarifikasi, boleh string kosong"
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
  - strengthsForInterview: ${input.realtimeContext.candidateContext.strengthsForInterview.join(", ") || "none"}
  - risks: ${input.realtimeContext.candidateContext.risks.join(", ") || "none"}

- applicationContext:
  - companyName: ${input.realtimeContext.applicationContext.companyName}
  - roleTitle: ${input.realtimeContext.applicationContext.roleTitle}
  - jdSummary: ${input.realtimeContext.applicationContext.jdSummary || "unknown"}
  - roleRequirements: ${input.realtimeContext.applicationContext.roleRequirements.join(", ") || "none"}
  - interviewPrepThemes: ${input.realtimeContext.applicationContext.interviewPrepThemes.join(", ") || "none"}
  - applicationContext: ${input.realtimeContext.applicationContext.applicationContext || "unknown"}

- domainProfile:
  - primaryDomain: ${input.realtimeContext.domainProfile.primaryDomain || "unknown"}
  - nicheDescription: ${input.realtimeContext.domainProfile.nicheDescription || "unknown"}
  - inScopeConcepts: ${input.realtimeContext.domainProfile.inScopeConcepts.join(", ") || "none"}
  - outOfScopeConcepts: ${input.realtimeContext.domainProfile.outOfScopeConcepts.join(", ") || "none"}
  - seedConcepts: ${input.realtimeContext.domainProfile.seedConcepts.join(", ") || "none"}
  - relevanceGuidance: ${input.realtimeContext.domainProfile.relevanceGuidance || "unknown"}

- stageContext:
  - stageType: ${input.realtimeContext.stageContext.stageType}
  - focus: ${input.realtimeContext.stageContext.focus.join(", ") || "none"}`
};
