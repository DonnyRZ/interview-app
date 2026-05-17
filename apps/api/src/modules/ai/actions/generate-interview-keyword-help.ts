import type { RealtimeContext } from "@interview-app/shared";
import type { ActionSpec } from "../action-types.js";
import { formatInterviewContextForPrompt, interviewContextUsagePolicy } from "./interview-context-format.js";

export type GenerateInterviewKeywordHelpInput = {
  keyword: string;
  interviewerQuestion?: string;
  recentTranscript?: string;
  realtimeContext: RealtimeContext;
};

export const generateInterviewKeywordHelpSpec: ActionSpec<GenerateInterviewKeywordHelpInput> = {
  actionId: "generate_interview_keyword_help",
  version: "2026-05-05.v1",
  goal: "Menjelaskan keyword interview yang relevan dan memberi angle singkat agar kandidat bisa merespons dengan tepat.",
  role: "Kamu adalah assistant keyword interview untuk kandidat saat live interview.",
  task: [
    "Baca keyword yang dipilih user dan realtimeContext application.",
    "Jelaskan arti keyword itu dalam konteks percakapan terbaru, bukan sebagai topik lepas.",
    "Pilih sumber konteks yang paling tepat: recentTranscript, general knowledge, CV, JD, atau gabungan CV/JD yang aman.",
    "Berikan 1-3 talking points singkat yang membantu kandidat menanggapi keyword tersebut.",
    "Jika keyword kurang jelas atau konteksnya lemah, jelaskan secara aman tanpa mengarang detail pengalaman kandidat."
  ].join("\n"),
  policyRules: [
    ...interviewContextUsagePolicy,
    "Penjelasan harus ringkas, natural, dan mudah discan cepat di overlay.",
    "Jangan mengklaim pengalaman, angka, tools, company, atau pencapaian yang tidak ada di CV context.",
    "Talking points harus relevan dengan keyword dan conversation terbaru; domain application hanya dipakai jika memang nyambung.",
    "Prioritaskan 2-3 poin singkat, masing-masing maksimal sekitar 18 kata.",
    "Jika keyword sebenarnya out-of-scope atau ambigu, berikan warning dan angle klarifikasi yang aman.",
    "Gunakan bahasa yang sama dengan keyword/interviewer jika jelas; jika tidak jelas, gunakan bahasa Indonesia.",
    "Semua field yang dicontohkan sebagai array wajib dikembalikan sebagai array JSON, walaupun kosong.",
    "Field warnings, missingInputs, dan evidence wajib tetap ada. Jika tidak ada isinya, kembalikan array kosong []."
  ],
  outputSchemaDescription: `Balas hanya dengan JSON valid:
{
  "status": "success | partial | insufficient_input | needs_human_review | failed_policy",
  "result": {
    "keywordSummary": "penjelasan singkat keyword dalam konteks role ini",
    "talkingPoints": ["maksimal 3 poin singkat"],
    "keywordStrategy": "catatan singkat tentang cara memakai keyword ini saat menjawab"
  },
  "warnings": ["string"],
  "missingInputs": ["string"],
  "confidence": "low | medium | high",
  "evidence": [{ "field": "string", "source": "string", "quote": "string" }]
}`,
  buildContext: (input) => `Runtime payload:
- keyword:
${input.keyword.trim() || "unknown"}

- interviewerQuestion:
${input.interviewerQuestion?.trim() || "unknown"}

- recentTranscript:
${input.recentTranscript?.trim() || "unknown"}

${formatInterviewContextForPrompt(input.realtimeContext)}`
};
