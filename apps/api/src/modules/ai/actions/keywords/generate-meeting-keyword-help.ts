import type { RealtimeContext } from "@interview-app/shared";
import type { ActionSpec } from "../../action-types.js";
import { formatMeetingContextForPrompt, meetingContextUsagePolicy } from "../shared/meeting-context-format.js";

export type GenerateMeetingKeywordHelpInput = {
  keyword: string;
  meetingPrompt?: string;
  realtimeContext: RealtimeContext;
};

export const generateMeetingKeywordHelpSpec: ActionSpec<GenerateMeetingKeywordHelpInput> = {
  actionId: "generate_meeting_keyword_help",
  version: "2026-05-27.v1",
  goal: "Menjelaskan keyword meeting yang relevan dan memberi angle singkat agar user bisa merespons dengan tepat.",
  role: "Kamu adalah assistant keyword meeting untuk user saat online meeting.",
  task: [
    "Baca keyword yang dipilih user dan konteks meeting terbaru.",
    "Jelaskan arti keyword itu dalam konteks percakapan terbaru, bukan sebagai topik lepas.",
    "Pilih sumber konteks yang paling tepat: latest conversation, general knowledge, user profile, meeting context, atau gabungan yang aman.",
    "Berikan 1-3 talking points singkat yang membantu user menanggapi keyword tersebut.",
    "Jika keyword kurang jelas atau konteksnya lemah, jelaskan secara aman tanpa mengarang detail."
  ].join("\n"),
  policyRules: [
    ...meetingContextUsagePolicy,
    "Penjelasan harus ringkas, natural, dan mudah discan cepat di overlay.",
    "Jangan mengklaim pengalaman, angka, tools, organisasi, atau pencapaian yang tidak ada di runtime context.",
    "Talking points harus relevan dengan keyword dan conversation terbaru; static context hanya dipakai jika memang nyambung.",
    "Prioritaskan 2-3 poin singkat, masing-masing maksimal sekitar 18 kata.",
    "Jika keyword out-of-scope atau ambigu, berikan warning dan angle klarifikasi yang aman.",
    "Jangan default ke framing use case, relasi, industri, atau domain tertentu kecuali transcript atau meeting context mendukungnya.",
    "Gunakan bahasa yang sama dengan keyword/konteks meeting jika jelas; jika tidak jelas, gunakan bahasa Indonesia.",
    "Semua field yang dicontohkan sebagai array wajib dikembalikan sebagai array JSON, walaupun kosong.",
    "Field warnings, missingInputs, dan evidence wajib tetap ada. Jika tidak ada isinya, kembalikan array kosong []."
  ],
  outputSchemaDescription: `Balas hanya dengan JSON valid:
{
  "status": "success | partial | insufficient_input | needs_human_review | failed_policy",
  "result": {
    "keywordSummary": "penjelasan singkat keyword dalam konteks percakapan terbaru",
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

- latestMeetingFocus:
${input.meetingPrompt?.trim() || "unknown"}

${formatMeetingContextForPrompt(input.realtimeContext)}`
};
