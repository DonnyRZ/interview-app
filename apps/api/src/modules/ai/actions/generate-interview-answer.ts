import type { RealtimeContext } from "@interview-app/shared";
import type { ActionSpec } from "../action-types.js";
import { formatInterviewContextForPrompt, interviewContextUsagePolicy } from "./interview-context-format.js";

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
    "Pilih sumber konteks yang paling tepat: recentTranscript, general knowledge, CV, JD, atau gabungan CV/JD yang aman.",
    "Hubungkan jawaban dengan pengalaman kandidat, role, JD, dan domain/niche hanya jika memang relevan.",
    "Jika pertanyaan teknis/proses kerja bisa dijawab tanpa data kandidat, jawab langsung tanpa memaksakan CV/JD.",
    "Jika pertanyaan belum jelas atau konteks tidak cukup, jangan mengarang; berikan jawaban klarifikasi yang aman."
  ].join("\n"),
  policyRules: [
    ...interviewContextUsagePolicy,
    "Jawaban harus terdengar seperti kandidat manusia, bukan seperti AI atau naskah panjang.",
    "Jangan mengklaim pengalaman, angka, tools, company, atau pencapaian yang tidak ada di CV context.",
    "Jika informasi CV tidak cukup, gunakan framing umum yang jujur dan tandai missingInputs.",
    "Prioritaskan jawaban dalam 3-5 poin singkat yang siap dibaca kandidat.",
    "Jangan menghasilkan daftar pertanyaan follow-up untuk action jawaban, kecuali interviewer atau user secara eksplisit meminta kandidat menanyakan sesuatu.",
    "Jika interviewer menutup dengan kesempatan bertanya seperti 'Ada pertanyaan?', jawab sebagai kandidat dengan bridge singkat dan maksimal satu pertanyaan natural; jangan berubah menjadi output Bantu Follow-up.",
    "Untuk pertanyaan teknis/domain, gunakan domainProfile sebagai bantuan relevansi, bukan kewajiban untuk selalu mengaitkan jawaban.",
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
    "shouldAnswer": true | false,
    "answerDraft": "jawaban singkat siap diucapkan, sebaiknya berbentuk 3-5 poin",
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

${formatInterviewContextForPrompt(input.realtimeContext)}`
};
