import type { ActionSpec } from "../action-types.js";

export type PreprocessApplicationJdInput = {
  companyName: string;
  roleTitle: string;
  jobDescription?: string;
  cvReadyContext?: string | null;
};

export const preprocessApplicationJdSpec: ActionSpec<PreprocessApplicationJdInput> = {
  actionId: "preprocess_application_context",
  version: "2026-05-04.v2",
  goal: "Mengubah company, role, job description, dan konteks CV aktif menjadi profil domain/niche untuk interview live.",
  role: "Kamu adalah mesin analisis domain interview untuk aplikasi kerja.",
  task: [
    "Analisis company, role, job description, dan konteks CV aktif yang tersedia.",
    "Pisahkan tanggung jawab utama, requirement utama, dan nice-to-have agar runtime bisa memilih konteks yang tepat.",
    "Tentukan domain/niche boundary yang akan menjadi pagar relevansi selama interview live.",
    "Hasilkan konteks terstruktur yang membantu runtime AI memutuskan apakah ucapan interviewer relevan dengan niche application.",
    "Jangan menghasilkan daftar keyword final untuk ditampilkan di overlay. Keyword final baru dipilih nanti dari transcript live."
  ].join("\n"),
  policyRules: [
    "Jangan menyatakan fakta tentang company kecuali fakta itu ada di payload yang diberikan.",
    "Kamu boleh memakai CV aktif untuk memahami kecocokan kandidat, tetapi domain/niche utama harus dipimpin oleh role dan job description.",
    "Jika job description terlalu pendek, set status menjadi partial dan buat domainProfile yang konservatif, bukan ekspansi agresif dari CV.",
    "Seed concepts hanya contoh konsep in-scope untuk membantu runtime relevance, bukan chip keyword final yang pasti tampil.",
    "Seed concepts maksimal 5 item, setiap item maksimal 2-4 kata.",
    "Responsibilities berisi tugas utama role dari JD, bukan interpretasi bebas.",
    "Nice to have hanya berisi hal yang eksplisit opsional/plus/preferred/bonus di JD. Jika tidak ada, kembalikan array kosong.",
    "Niche description maksimal 2 kalimat pendek.",
    "Out-of-scope concepts maksimal 5 item dan hanya berisi contoh paling penting.",
    "Interview prep themes maksimal 3 item, setiap item maksimal 8-12 kata, dan hanya untuk persiapan kandidat.",
    "Gunakan bahasa Indonesia untuk semua field natural-language karena UI produk saat ini berbahasa Indonesia.",
    "Semua field yang dicontohkan sebagai array wajib dikembalikan sebagai array JSON, walaupun hanya berisi satu item atau kosong.",
    "Field warnings, missingInputs, dan evidence wajib tetap ada. Jika tidak ada isinya, kembalikan array kosong []."
  ],
  outputSchemaDescription: `Balas hanya dengan JSON valid:
{
  "status": "success | partial | insufficient_input | needs_human_review | failed_policy",
  "result": {
    "jdSummary": "string",
    "roleRequirements": ["string"],
    "responsibilities": ["string"],
    "niceToHave": ["string"],
    "domainProfile": {
      "primaryDomain": "string",
      "nicheDescription": "maksimal 2 kalimat pendek",
      "inScopeConcepts": ["maksimal 8 item"],
      "outOfScopeConcepts": ["maksimal 5 item"],
      "seedConcepts": ["maksimal 5 item, 2-4 kata per item"],
      "relevanceGuidance": "deskripsi boundary relevansi, bukan instruksi model"
    },
    "interviewPrepThemes": ["maksimal 3 item, 8-12 kata per item"],
    "applicationContext": "string"
  },
  "warnings": ["string"],
  "missingInputs": ["string"],
  "confidence": "low | medium | high",
  "evidence": [{ "field": "string", "source": "string", "quote": "string" }]
}`,
  buildContext: (input) => `Runtime payload:
- companyName: ${input.companyName}
- roleTitle: ${input.roleTitle}
- jobDescription:
${input.jobDescription?.trim() || "unknown"}

- activeCvReadyContext:
${input.cvReadyContext?.trim() || "unknown"}`
};
