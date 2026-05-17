type RealtimeActionPromptPayload = {
  action: "answer" | "followup" | "explain" | "keyword" | "ask";
  latestQuestion?: string;
  recentTranscript?: string;
  triggerText?: string;
};

export function buildRealtimeActionPrompt(payload: RealtimeActionPromptPayload) {
  const trigger = getRealtimeTriggerName(payload.action);
  const actionInstruction = buildRealtimeActionInstruction(payload);
  return [
    `TRIGGER: ${trigger}`,
    payload.recentTranscript ? `Conversation window terbaru:\n${payload.recentTranscript}` : "",
    payload.latestQuestion ? `Latest conversation focus:\n${payload.latestQuestion}` : "",
    payload.triggerText ? `Input user/keyword: ${payload.triggerText}` : "",
    "Prioritaskan conversation window terbaru di atas memori percakapan lama.",
    "Jangan menjawab dari konteks beberapa menit lalu jika tidak muncul di conversation window ini.",
    "Jawab berdasarkan konteks transcript lengkap, bukan hanya potongan kalimat terakhir.",
    buildContextUsagePolicy(payload),
    actionInstruction
  ].filter(Boolean).join("\n");
}

function buildContextUsagePolicy(payload: RealtimeActionPromptPayload) {
  return [
    "Pilih sumber konteks secara adaptif sebelum menjawab:",
    "- Jika pertanyaan bisa dijawab sebagai pengetahuan umum/teknis/proses kerja, jawab langsung tanpa memaksakan CV atau JD.",
    "- Jika interviewer meminta intro, background, atau pengalaman paling relevan, gunakan CV sebagai sumber utama dan pakai JD hanya untuk memilih relevansi role secara ringan.",
    "- Jika interviewer meminta pengalaman, contoh nyata, background, project, kekuatan, atau cerita kandidat, gunakan bukti CV yang paling relevan.",
    "- Jika interviewer meminta cerita project, tantangan, kegagalan, atau kasus sulit, jawab dengan company/project/blocker/solusi yang spesifik dari CV; jangan berhenti di proses generik.",
    "- Jika interviewer membahas role, ekspektasi kerja, responsibility, requirement, nice-to-have, atau closing question, gunakan JD seperlunya dan kaitkan ke CV hanya jika aman.",
    "- Jika interviewer menutup dengan kesempatan bertanya, prioritaskan pertanyaan siap ucap dari JD/responsibility/nice-to-have; kaitkan CV hanya jika ada match yang benar-benar jelas.",
    "- Jika konteksnya debat, reaksi, maksud tersirat, atau tekanan percakapan, prioritaskan conversation window terbaru dan general knowledge yang wajar.",
    "- Jangan menyebut company, project, angka, tanggal, pendidikan, organisasi, internship, atau detail JD jika tidak tersedia di context.",
    "- Jangan overfit ke contoh use case tertentu; ikuti intent percakapan terbaru dan kebutuhan tombol ini.",
    "- Gunakan kosakata role/JD/transcript aktual; jangan default ke vocabulary teknis jika interview membahas pekerjaan non-teknis atau operasional.",
    payload.action === "followup"
      ? "- Untuk follow-up, jangan selalu mengaitkan CV. Tanyakan hal yang paling membantu kandidat memahami kebutuhan interviewer."
      : "",
    payload.action === "explain"
      ? "- Untuk penjelasan maksud, fokus pada apa yang sedang diuji atau disiratkan, lalu beri angle respons singkat."
      : "",
    payload.action === "keyword"
      ? "- Untuk keyword, jelaskan keyword sesuai konteks percakapan, bukan sebagai topik lepas."
      : ""
  ].filter(Boolean).join("\n");
}

function buildRealtimeActionInstruction(payload: RealtimeActionPromptPayload) {
  if (payload.action === "answer") {
    return [
      "Output untuk BANTU_JAWAB wajib berupa jawaban kandidat yang siap dibaca langsung.",
      "Format wajib 3-5 bullet, satu bullet per baris, maksimal satu kalimat per bullet.",
      "Tulis dengan sudut pandang saya/kandidat, bukan saran untuk menjawab.",
      "Jangan tulis label BANTU_JAWAB.",
      "Jangan pakai kalimat instruksi seperti jelaskan, tekankan, sampaikan, sebutkan, atau kamu bisa."
    ].join("\n");
  }

  if (payload.action === "followup") {
    return [
      "Output untuk BANTU_FOLLOWUP wajib berupa 2-3 pertanyaan follow-up yang siap diucapkan kandidat.",
      "Format wajib satu pertanyaan per baris.",
      "Tulis langsung sebagai kalimat tanya.",
      "Jangan pakai instruksi seperti tanyakan, minta, atau kamu bisa bertanya."
    ].join("\n");
  }

  if (payload.action === "explain") {
    return [
      "Output untuk JELASKAN_MAKSUDNYA berisi maksud interviewer secara singkat dan angle jawaban terbaik.",
      "Format 2-3 bullet pendek.",
      "Boleh berupa penjelasan, tapi tetap ringkas dan langsung membantu kandidat menjawab."
    ].join("\n");
  }

  if (payload.action === "keyword") {
    return [
      "Output untuk EXPLAIN_KEYWORD berisi arti keyword singkat dan satu kalimat siap pakai untuk jawaban interview.",
      "Format 2 bullet: arti singkat, lalu kalimat siap pakai.",
      "Jangan melebar menjadi jawaban penuh kecuali keyword memang membutuhkan konteks."
    ].join("\n");
  }

  return [
    "Ikuti permintaan user.",
    "Kalau user meminta jawaban, tulis jawaban siap dibaca.",
    "Kalau user meminta penjelasan, jelaskan singkat dan actionable."
  ].join("\n");
}

function getRealtimeTriggerName(action: RealtimeActionPromptPayload["action"]) {
  if (action === "answer") return "BANTU_JAWAB";
  if (action === "followup") return "BANTU_FOLLOWUP";
  if (action === "explain") return "JELASKAN_MAKSUDNYA";
  if (action === "keyword") return "EXPLAIN_KEYWORD";
  return "ASK";
}
