import type { RealtimeContext } from "@interview-app/shared";
import type { ActionSpec } from "../action-types.js";
import { formatInterviewContextForPrompt } from "./interview-context-format.js";

export type SurfaceRealtimeKeywordsInput = {
  transcriptSegment: string;
  realtimeContext: RealtimeContext;
};

export const surfaceRealtimeKeywordsSpec: ActionSpec<SurfaceRealtimeKeywordsInput> = {
  actionId: "surface_realtime_keywords",
  version: "2026-05-10.v3",
  goal: "Memilih keyword interview yang paling membantu dari ucapan interviewer dengan relevansi berlapis terhadap CV + JD.",
  role: "Kamu adalah classifier keyword realtime untuk overlay interview.",
  task: [
    "Baca realtimeContext application dan potongan transcript interviewer terbaru.",
    "Nilai relevansi transcript secara berlapis, bukan hanya irisan niche yang paling sempit.",
    "Layer yang boleh dianggap relevan: core role/domain, skill kandidat, responsibility JD, business domain, adjacent knowledge yang wajar untuk interview, dan macro/contextual factor yang memengaruhi domain.",
    "Jika transcript masuk salah satu layer relevansi tersebut, pilih maksimal 3 keyword spesifik yang benar-benar muncul atau tersirat kuat dari transcript terbaru.",
    "Jika transcript benar-benar tidak terkait dengan role, JD, candidate context, business domain, atau adjacent knowledge yang wajar, kembalikan keywords kosong dan shouldExpandOverlay false."
  ].join("\n"),
  policyRules: [
    "Jangan menampilkan keyword hanya karena istilah itu terdengar penting secara umum; harus ada alasan relevansi terhadap percakapan terbaru, CV, JD, atau role.",
    "Keyword chips bersifat opsional. Jika transcript belum memunculkan istilah konkret yang membantu, kembalikan keywords kosong; tombol bantuan lain tetap bisa dipakai.",
    "Jangan mengutamakan vocabulary bidang tertentu. Ikuti role, JD, CV, dan transcript aktual, baik role-nya teknis, operasional, hospitality, supply chain, administrasi, kreatif, sales, finance, legal, healthcare, atau bidang lain.",
    "Keyword boleh berasal dari core niche, skill utama role, konsep umum bidang kerja, business process, domain industry, atau faktor eksternal yang logis memengaruhi role.",
    "Pertanyaan generic tidak otomatis out-of-scope jika generic itu masih menguji kompetensi role, skill kandidat, bidang kerja, atau professional judgment.",
    "Seed concepts hanya referensi domain, bukan daftar wajib match.",
    "Jangan mengeluarkan seed concept atau in-scope concept sebagai chip kalau konsep itu tidak muncul, tidak diparafrasekan, dan tidak tersirat kuat di transcript terbaru.",
    "Out-of-scope berarti topik yang tidak punya hubungan wajar dengan role, JD, kandidat, business domain, atau adjacent professional knowledge.",
    "Jika transcript membahas konsep true out-of-scope, return keywords kosong.",
    "Keyword harus pendek, spesifik, dan bisa dijelaskan cepat saat user klik.",
    "Keyword term maksimal 2-4 kata dan harus terdengar natural sebagai chip UI.",
    "Hindari keyword yang terdengar seperti frasa mentah atau terjemahan kaku; pilih istilah domain yang umum dipakai.",
    "Jangan tampilkan keyword terlalu generik seperti pengalaman, motivasi, project, komunikasi, atau nama company.",
    "Jika transcript bertanya soal pengetahuan dasar bidang yang relevan, pilih keyword konsep yang konkret, bukan label luas seperti AI, teknologi, atau bisnis.",
    "Gunakan bahasa keyword sesuai istilah yang paling natural di domain tersebut.",
    "Semua field yang dicontohkan sebagai array wajib dikembalikan sebagai array JSON, walaupun kosong.",
    "Field warnings, missingInputs, dan evidence wajib tetap ada. Jika tidak ada isinya, kembalikan array kosong []."
  ],
  outputSchemaDescription: `Balas hanya dengan JSON valid:
{
  "status": "success | partial | insufficient_input | needs_human_review | failed_policy",
  "result": {
    "shouldExpandOverlay": true,
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
${formatInterviewContextForPrompt(input.realtimeContext)}

- latestInterviewerTranscriptSegment:
${input.transcriptSegment.trim() || "unknown"}`
};
