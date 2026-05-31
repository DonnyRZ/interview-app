import type { ActionSpec } from "../../action-types.js";

export type PreprocessMeetingContextInput = {
  contextName: string;
  meetingTopic: string;
  meetingBrief?: string;
  profileDocumentReadyContext?: string | null;
};

export const preprocessMeetingContextSpec: ActionSpec<PreprocessMeetingContextInput> = {
  actionId: "preprocess_meetingContext_context",
  promptActionId: "preprocess_meeting_context",
  version: "2026-05-27.v1",
  goal: "Mengubah konteks sesi, topik meeting, dokumen brief, dan profil aktif menjadi profil domain/niche untuk meeting live.",
  role: "Kamu adalah analis konteks meeting untuk aplikasi online meeting lintas bidang.",
  task: [
    "Analisis organisasi/counterparty, topik sesi, brief meeting, dan konteks profil aktif yang tersedia.",
    "Pisahkan scope utama, requirement/kriteria utama, dan pertimbangan opsional agar runtime bisa memilih konteks yang tepat.",
    "Tentukan domain/niche boundary yang akan menjadi pagar relevansi selama meeting live.",
    "Hasilkan konteks terstruktur yang membantu runtime AI memutuskan apakah ucapan lawan bicara relevan dengan konteks sesi.",
    "Jangan menghasilkan daftar keyword final untuk ditampilkan di overlay. Keyword final baru dipilih nanti dari transcript live."
  ].join("\n"),
  policyRules: [
    "Jangan menyatakan fakta tentang organisasi/counterparty kecuali fakta itu ada di payload yang diberikan.",
    "Kamu boleh memakai profil aktif untuk memahami konteks user, tetapi domain/niche utama harus dipimpin oleh topik sesi dan brief meeting.",
    "Jika brief meeting terlalu pendek, set status menjadi partial dan buat domainProfile yang konservatif, bukan ekspansi agresif dari profil user.",
    "Domain profile harus meeting-neutral: jangan default ke kosakata bidang tertentu jika topik/brief/profil tidak mendukungnya.",
    "Untuk sesi non-teknis atau operasional, domainProfile boleh memakai scope, proses kerja, standar kualitas, keselamatan, layanan, koordinasi, inventory, atau compliance yang eksplisit relevan.",
    "Seed concepts hanya contoh konsep in-scope untuk membantu runtime relevance, bukan chip keyword final yang pasti tampil.",
    "Seed concepts maksimal 5 item, setiap item maksimal 2-4 kata.",
    "Responsibilities berisi scope atau tanggung jawab utama dari brief, bukan interpretasi bebas.",
    "Nice to have hanya berisi hal yang eksplisit opsional/plus/preferred/bonus di brief. Jika tidak ada, kembalikan array kosong.",
    "Niche description maksimal 2 kalimat pendek.",
    "Out-of-scope concepts maksimal 5 item dan hanya berisi contoh paling penting.",
    "Preparation themes berisi hal penting yang perlu disiapkan untuk sesi meeting, maksimal 3 item, setiap item maksimal 8-12 kata.",
    "Gunakan bahasa Indonesia untuk semua field natural-language karena UI produk saat ini berbahasa Indonesia.",
    "Semua field yang dicontohkan sebagai array wajib dikembalikan sebagai array JSON, walaupun hanya berisi satu item atau kosong.",
    "Field warnings, missingInputs, dan evidence wajib tetap ada. Jika tidak ada isinya, kembalikan array kosong []."
  ],
  outputSchemaDescription: `Balas hanya dengan JSON valid:
{
  "status": "success | partial | insufficient_input | needs_human_review | failed_policy",
  "result": {
    "meetingSummary": "ringkasan brief atau konteks meeting",
    "keyCriteria": ["kriteria, kebutuhan, constraint, atau fokus utama sesi"],
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
    "preparationThemes": ["maksimal 3 item, 8-12 kata per item"],
    "contextText": "string"
  },
  "warnings": ["string"],
  "missingInputs": ["string"],
  "confidence": "low | medium | high",
  "evidence": [{ "field": "string", "source": "string", "quote": "string" }]
}`,
  buildContext: (input) => `Runtime payload:
- organizationOrCounterparty: ${input.contextName}
- sessionTitleOrTopic: ${input.meetingTopic}
- meetingBrief:
${input.meetingBrief?.trim() || "unknown"}

- activeProfileReadyContext:
${input.profileDocumentReadyContext?.trim() || "unknown"}`
};
