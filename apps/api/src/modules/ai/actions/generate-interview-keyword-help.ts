import type { RealtimeContext } from "@interview-app/shared";
import type { ActionSpec } from "../action-types.js";

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
    "Jelaskan arti keyword itu dalam konteks role/application ini.",
    "Berikan 1-3 talking points singkat yang membantu kandidat menanggapi keyword tersebut.",
    "Jika keyword kurang jelas atau konteksnya lemah, jelaskan secara aman tanpa mengarang detail pengalaman kandidat."
  ].join("\n"),
  policyRules: [
    "Penjelasan harus ringkas, natural, dan mudah discan cepat di overlay.",
    "Jangan mengklaim pengalaman, angka, tools, company, atau pencapaian yang tidak ada di CV context.",
    "Talking points harus relevan dengan keyword dan domain application ini.",
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

- stageContext:
  - stageType: ${input.realtimeContext.stageContext.stageType}
  - focus: ${input.realtimeContext.stageContext.focus.join(", ") || "none"}`
};
