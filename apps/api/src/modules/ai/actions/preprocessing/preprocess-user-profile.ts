import type { ActionSpec } from "../../action-types.js";

export type PreprocessCvInput = {
  fileName: string;
  fileMimeType?: string | null;
};

export const preprocessCvSpec: ActionSpec<PreprocessCvInput> = {
  actionId: "preprocess_cv",
  version: "2026-05-27.v1",
  goal: "Mengubah dokumen identitas/profil user yang diupload menjadi konteks reusable untuk online meeting.",
  role: "Kamu adalah mesin ekstraksi informasi untuk membuat user profile reference yang aman dipakai ulang.",
  task: [
    "Baca file profil yang diberikan.",
    "Ekstrak hanya informasi user yang didukung oleh isi file.",
    "Buat konteks ringkas yang bisa dipakai ulang untuk bantuan online meeting berikutnya.",
    "Pisahkan pengalaman kerja per organisasi, pendidikan, organisasi/komunitas, dan pengalaman awal agar runtime bisa memilih bukti yang tepat."
  ].join("\n"),
  policyRules: [
    "Jangan mengarang nama organisasi, gelar, tanggal, skill, atau pencapaian yang tidak didukung oleh file.",
    "Jika bukti tidak ada atau ambigu, isi missingInputs atau warnings daripada menebak.",
    "Untuk setiap pengalaman kerja, usahakan isi organisasi, posisi, range tanggal, durasi, project, tanggung jawab, impact, dan tools/metode jika ada.",
    "Jika file tidak menyebut project, impact, durasi, organisasi, pendidikan, atau pengalaman awal, biarkan field terkait kosong dan tulis warning bila penting.",
    "Jangan mengubah pengalaman menjadi cerita dramatis. Simpan fakta sebagai data mentah yang bisa dipakai runtime.",
    "Buat readyContext praktis untuk bantuan meeting live, bukan biografi publik.",
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
    "experiences": [
      {
        "companyName": "string",
        "roleTitle": "string",
        "dateRange": "string",
        "duration": "string",
        "projects": ["string"],
        "responsibilities": ["string"],
        "impact": ["string"],
        "technologies": ["string"]
      }
    ],
    "education": [
      {
        "institution": "string",
        "degree": "string",
        "major": "string",
        "dateRange": "string",
        "notes": ["string"]
      }
    ],
    "organizations": [
      {
        "organizationName": "string",
        "roleTitle": "string",
        "dateRange": "string",
        "responsibilities": ["string"]
      }
    ],
    "internships": [
      {
        "companyName": "string",
        "roleTitle": "string",
        "dateRange": "string",
        "duration": "string",
        "responsibilities": ["string"],
        "projects": ["string"]
      }
    ],
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

Isi file dilampirkan sebagai inline file part.`
};
