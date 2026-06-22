import type { MeetingContext, ProfileDocument } from "@interview-app/shared";

export type WorkspaceMeetingContext = MeetingContext & {
  focus: string;
  summary: string;
  meetingBriefDisplay: string;
  preparationThemes: string[];
};

type ProfileDocumentAiEnvelope = {
  result?: { userProfileSummary?: string };
};

type MeetingContextAiEnvelope = {
  result?: {
    meetingSummary?: string;
    preparationThemes?: string[];
    likelyInterviewThemes?: string[];
    domainProfile?: {
      primaryDomain?: string;
      nicheDescription?: string;
    };
  };
};

export function mapWorkspaceMeetingContext(meetingContext: MeetingContext): WorkspaceMeetingContext {
  const result = getMeetingContextAiResult(meetingContext);
  const summary = normalizeText(
    result?.meetingSummary
      || meetingContext.meetingContextText
      || meetingContext.meetingBrief
      || "Ringkasan meeting belum tersedia."
  );
  const focus = normalizeText(
    result?.domainProfile?.nicheDescription
      || result?.domainProfile?.primaryDomain
      || summary
      || meetingContext.meetingTopic
  );
  const themes = compactTextList(result?.preparationThemes || result?.likelyInterviewThemes, 5, 160);

  return {
    ...meetingContext,
    focus,
    summary,
    meetingBriefDisplay: normalizeText(meetingContext.meetingBrief || "Brief meeting belum ditambahkan."),
    preparationThemes: themes
  };
}

export function getProfileSummary(profileDocument: ProfileDocument | null) {
  if (!profileDocument) return "Upload profil untuk membuat ringkasan user yang dipakai ulang di semua konteks meeting.";
  if (profileDocument.processingStatus === "processing") return "AI sedang membaca profil dan menyusun ringkasan user.";
  if (profileDocument.processingStatus === "failed") return profileDocument.processingError || "AI gagal memproses profil ini.";
  const envelope = profileDocument.summaryJson as ProfileDocumentAiEnvelope | null;
  return normalizeText(
    envelope?.result?.userProfileSummary
      || profileDocument.readyContext
      || "Ringkasan profil belum tersedia."
  );
}

export function getProfileStatusTitle(profileDocument: ProfileDocument | null) {
  if (!profileDocument) return "Belum Ada Profil";
  if (profileDocument.processingStatus === "processing") return "AI Memproses";
  if (profileDocument.processingStatus === "failed") return "AI Gagal";
  if (profileDocument.processingStatus === "uploaded") return "Menunggu Proses";
  return "AI Ready";
}

export function getProfileStatusMessage(profileDocument: ProfileDocument | null) {
  if (!profileDocument) return "Upload profil pertama untuk mulai membuat konteks meeting.";
  if (profileDocument.processingStatus === "processing") return "AI sedang mengekstrak pengalaman dan konteks user.";
  if (profileDocument.processingStatus === "failed") return profileDocument.processingError || "Profil gagal diproses. Jalankan proses ulang.";
  if (profileDocument.processingStatus === "uploaded") return "Profil sudah diupload dan menunggu AI processing.";
  return "Profil siap digunakan sebagai referensi meeting.";
}

export function formatWorkspaceDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function getMeetingContextAiResult(meetingContext: MeetingContext) {
  const envelope = meetingContext.meetingSummaryJson as MeetingContextAiEnvelope | null;
  return envelope && typeof envelope === "object" ? envelope.result : undefined;
}

function compactTextList(items: unknown, maxItems: number, maxCharacters: number) {
  if (!Array.isArray(items)) return [];
  return Array.from(new Set(items
    .filter((item): item is string => typeof item === "string")
    .map((item) => truncateText(item, maxCharacters))
    .filter(Boolean)))
    .slice(0, maxItems);
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function truncateText(value: string, maxCharacters: number) {
  const normalized = normalizeText(value);
  if (normalized.length <= maxCharacters) return normalized;
  return `${normalized.slice(0, Math.max(0, maxCharacters - 3)).trimEnd()}...`;
}
