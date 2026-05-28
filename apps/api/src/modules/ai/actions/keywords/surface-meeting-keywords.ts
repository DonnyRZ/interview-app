import type { RealtimeContext } from "@interview-app/shared";
import type { ActionSpec } from "../../action-types.js";
import { formatMeetingContextForPrompt } from "../shared/meeting-context-format.js";

export type SurfaceRealtimeKeywordsInput = {
  transcriptSegment: string;
  realtimeContext: RealtimeContext;
};

export const surfaceRealtimeKeywordsSpec: ActionSpec<SurfaceRealtimeKeywordsInput> = {
  actionId: "surface_realtime_keywords",
  version: "2026-05-27.v1",
  goal: "Memilih keyword chips near realtime dari kata atau topik penting yang disebut lawan bicara terbaru dalam online meeting.",
  role: "Kamu adalah classifier keyword realtime untuk overlay meeting.",
  task: [
    "Baca potongan transcript meeting terbaru dan realtimeContext.",
    "Pilih maksimal 3 keyword atau short phrase yang paling berguna untuk diklik user saat meeting berlangsung.",
    "Keyword harus berasal dari term/topik yang disebut atau tersirat langsung di transcript terbaru.",
    "Gunakan user profile, meeting context, dan domain profile hanya sebagai filter atau ranking ringan ketika terlalu banyak pilihan keyword, bukan sebagai sumber keyword baru.",
    "Jika transcript hanya berisi jenis pertanyaan umum tanpa term/topik konkret, kembalikan keywords kosong dan shouldExpandOverlay false."
  ].join("\n"),
  policyRules: [
    "Keyword chips bersifat transcript-first dan evidence-based.",
    "Jangan memilih keyword berdasarkan jenis pertanyaan atau intent category seperti pengalaman, project, motivasi, komunikasi, problem solving, decision making, workflow, atau strategy.",
    "Keyword boleh berupa exact term, acronym, metric, platform, product/domain term, konsep teknis, atau frasa pendek yang merangkum problem spesifik dari transcript.",
    "Pertahankan casing asli untuk acronym, tool, platform, dan istilah teknis yang disebut lawan bicara.",
    "Jangan hardcode atau memprioritaskan contoh dari dokumen, test, mockup, brand, platform, metric, domain, organisasi, topik sesi, seed concept, user profile, atau meeting context.",
    "Jangan mengeluarkan keyword dari user profile, meeting context, seed concept, in-scope concept, atau domain profile jika term itu tidak muncul atau tidak tersirat langsung di transcript terbaru.",
    "Jika transcript benar-benar belum punya term/topik konkret, return keywords kosong; tombol bantuan lain tetap bisa dipakai.",
    "Keyword harus pendek, spesifik, natural sebagai chip UI, dan bisa dijelaskan cepat saat user klik.",
    "Keyword term maksimal 2-4 kata.",
    "Jangan default ke interview, hiring, sales, consulting, technical, atau business vocabulary kecuali transcript menyebutnya.",
    "Semua field yang dicontohkan sebagai array wajib dikembalikan sebagai array JSON, walaupun kosong.",
    "Field warnings, missingInputs, dan evidence wajib tetap ada. Jika tidak ada isinya, kembalikan array kosong []."
  ],
  outputSchemaDescription: `Balas hanya dengan JSON valid:
{
  "status": "success | partial | insufficient_input | needs_human_review | failed_policy",
  "result": {
    "shouldExpandOverlay": true | false,
    "keywords": [
      {
        "term": "string",
        "whyRelevant": "string",
        "explanationHint": "string"
      }
    ]
  },
  "warnings": ["string"],
  "missingInputs": ["string"],
  "confidence": "low | medium | high",
  "evidence": [{ "field": "string", "source": "string", "quote": "string" }]
}`,
  buildContext: (input) => `Runtime payload:
${formatMeetingContextForPrompt(input.realtimeContext)}

- latestMeetingTranscriptSegment:
${input.transcriptSegment.trim() || "unknown"}`
};
