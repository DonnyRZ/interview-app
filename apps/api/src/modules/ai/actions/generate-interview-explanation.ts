import type { RealtimeContext } from "@interview-app/shared";
import type { ActionSpec } from "../action-types.js";
import { formatInterviewContextForPrompt, interviewContextUsagePolicy } from "./interview-context-format.js";

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
    "Pilih sumber konteks yang paling tepat: recentTranscript, general knowledge, CV, JD, atau gabungan CV/JD yang aman.",
    "Berikan angle jawaban aman agar kandidat bisa merespons dengan tepat tanpa mengarang."
  ].join("\n"),
  policyRules: [
    ...interviewContextUsagePolicy,
    "Penjelasan harus ringkas, natural, dan mudah discan cepat di overlay.",
    "Jangan mengklaim pengalaman, angka, tools, company, atau pencapaian yang tidak ada di CV context.",
    "Jelaskan statement, reaksi, debat, atau implied question meskipun kalimat interviewer bukan pertanyaan formal.",
    "Jika pertanyaan teknis/domain, gunakan domainProfile sebagai bantuan relevansi, bukan kewajiban untuk selalu mengaitkan CV/JD.",
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

${formatInterviewContextForPrompt(input.realtimeContext)}`
};
