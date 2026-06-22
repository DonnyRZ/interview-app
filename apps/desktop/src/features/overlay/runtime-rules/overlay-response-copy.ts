export {
  extractRealtimeResponseText,
  formatRealtimeResponsePoints
} from "@interview-app/shared/realtime-overlay";

export type RuntimeKeywordStatus = "idle" | "loading" | "ready" | "empty" | "error";

export type HelpResponse = {
  title: string;
  points: string[];
  kind: "help" | "notice";
};

export function getRuntimeKeywordMessage(status: RuntimeKeywordStatus, context: { domainLabel?: string }) {
  if (status === "loading") return "Mencari keyword relevan dari konteks terbaru...";
  if (status === "error") return "Keyword belum berhasil dibuat. Coba kirim transcript lagi.";
  if (status === "empty") return "Belum ada keyword yang cukup relevan dari konteks terbaru.";
  return `Chips muncul saat topik lawan bicara relevan dengan ${context.domainLabel || "konteks meeting"}.`;
}

export function buildNoFreshContextResponse(): HelpResponse {
  return {
    title: "Konteks Belum Tertangkap",
    kind: "notice",
    points: [
      "Konteks percakapan yang stabil belum tertangkap.",
      "Tunggu transcript lawan bicara muncul, lalu klik bantuan lagi.",
      "Jika lawan bicara baru mulai bicara, saya menunggu transcript baru sebelum memberi bantuan."
    ]
  };
}

export function buildNoKeywordResponse(): HelpResponse {
  return {
    title: "Keyword Belum Ada",
    kind: "notice",
    points: [
      "Belum ada keyword spesifik yang bisa dijelaskan dari konteks terbaru.",
      "Kalau butuh bantuan sekarang, pakai Jawab Pertanyaan, Tanggapi, Pertanyaan Follow-up, Jelaskan Maksudnya, atau tulis pertanyaan manual di Ask.",
      "Saya tidak akan membuat keyword dummy karena bisa menyesatkan saat meeting."
    ]
  };
}

export function buildRealtimeUnavailableResponse(message?: string): HelpResponse {
  return {
    title: "Realtime Belum Aktif",
    kind: "notice",
    points: [
      message || "Realtime session belum aktif.",
      "Live help harus tersambung ke gpt-realtime-mini dulu.",
      "Tidak ada fallback diam-diam ke gpt-5-mini untuk tombol live meeting."
    ]
  };
}
