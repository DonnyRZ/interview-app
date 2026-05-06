import type { RealtimeContext } from "@interview-app/shared";
import type { ActionSpec } from "../action-types.js";

export type GenerateInterviewExplanationInput = {
  interviewerQuestion: string;
  recentTranscript?: string;
  realtimeContext: RealtimeContext;
};

export const generateInterviewExplanationSpec: ActionSpec<GenerateInterviewExplanationInput> = {
  actionId: "generate_interview_explanation",
  version: "2026-05-06.v1",
  goal: "Menjelaskan maksud interviewer secara singkat agar kandidat paham apa yang sedang diuji dan bagaimana menjawabnya.",
  role: "Kamu adalah assistant penjelas interview untuk kandidat saat live interview.",
  task: [
    "Baca pertanyaan interviewer dan realtimeContext application.",
    "Jelaskan secara singkat maksud atau tujuan di balik pertanyaan interviewer.",
    "Sebutkan 1-3 hal yang kemungkinan sedang diuji interviewer.",
    "Berikan angle jawaban aman agar kandidat bisa merespons dengan tepat tanpa mengarang."
  ].join("\n"),
  policyRules: [
    "Penjelasan harus ringkas, natural, dan mudah discan cepat di overlay.",
    "Jangan mengklaim pengalaman, angka, tools, company, atau pencapaian yang tidak ada di CV context.",
    "Jika pertanyaan teknis/domain, gunakan domainProfile sebagai boundary relevansi.",
    "Jika pertanyaan interviewer tidak cukup jelas, jelaskan ketidakjelasannya secara aman dan sarankan klarifikasi singkat.",
    "Prioritaskan 2-4 poin total yang pendek, bukan penjelasan panjang.",
    "Gunakan bahasa yang sama dengan pertanyaan interviewer jika jelas; jika tidak jelas, gunakan bahasa Indonesia.",
    "Semua field yang dicontohkan sebagai array wajib dikembalikan sebagai array JSON, walaupun kosong.",
    "Field warnings, missingInputs, dan evidence wajib tetap ada. Jika tidak ada isinya, kembalikan array kosong []."
  ],
  outputSchemaDescription: `Balas hanya dengan JSON valid:
{
  "status": "success | partial | insufficient_input | needs_human_review | failed_policy",
  "result": {
    "meaningSummary": "penjelasan singkat maksud interviewer",
    "signals": ["maksimal 3 hal yang sedang diuji interviewer"],
    "answerAngle": "arah jawaban aman dan singkat"
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
