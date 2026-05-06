import type { ActionSpec } from "../action-types.js";

export type PreprocessCvInput = {
  fileName: string;
  fileMimeType?: string | null;
};

export const preprocessCvSpec: ActionSpec<PreprocessCvInput> = {
  actionId: "preprocess_cv",
  version: "2026-05-03.v1",
  goal: "Mengubah CV kandidat yang diupload menjadi konteks interview yang bisa dipakai ulang.",
  role: "Kamu adalah mesin ekstraksi informasi untuk persiapan interview.",
  task: [
    "Baca file CV yang diberikan.",
    "Ekstrak hanya informasi kandidat yang didukung oleh isi CV.",
    "Buat konteks ringkas yang bisa dipakai ulang untuk bantuan interview pada application berikutnya."
  ].join("\n"),
  policyRules: [
    "Jangan mengarang nama perusahaan, gelar, tanggal, skill, atau pencapaian yang tidak didukung oleh CV.",
    "Jika bukti tidak ada atau ambigu, isi missingInputs atau warnings daripada menebak.",
    "Buat readyContext praktis untuk bantuan interview live, bukan biografi publik.",
    "Gunakan bahasa Indonesia untuk semua field natural-language karena UI produk saat ini berbahasa Indonesia.",
    "Semua field yang dicontohkan sebagai array wajib dikembalikan sebagai array JSON, walaupun hanya berisi satu item atau kosong.",
    "Field warnings, missingInputs, dan evidence wajib tetap ada. Jika tidak ada isinya, kembalikan array kosong []."
  ],
  outputSchemaDescription: `Balas hanya dengan JSON valid:
{
  "status": "success | partial | insufficient_input | needs_human_review | failed_policy",
  "result": {
    "candidateSummary": "string",
    "skills": ["string"],
    "relevantExperience": ["string"],
    "strengthsForInterview": ["string"],
    "risks": ["string"],
    "readyContext": "string"
  },
  "warnings": ["string"],
  "missingInputs": ["string"],
  "confidence": "low | medium | high",
  "evidence": [{ "field": "string", "source": "string", "quote": "string" }]
}`,
  buildContext: (input) => `Runtime payload:
- namaFile: ${input.fileName}
- mimeTypeFile: ${input.fileMimeType || "unknown"}

Isi CV dilampirkan sebagai inline file part.`
};
