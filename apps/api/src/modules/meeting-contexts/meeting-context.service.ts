import type { CreateMeetingContextRequest, UpdateMeetingContextRequest } from "@interview-app/shared";
import { preprocessMeetingContextResultSchema, type PreprocessMeetingContextResult } from "../ai/action-schemas.js";
import { preprocessMeetingContextSpec } from "../ai/action-specs.js";
import { runOpenAiJsonAction } from "../ai/action-runner.js";
import { DEV_USER_ID } from "../dev/dev-user.js";
import { ensureDevUser } from "../dev/dev-user.repository.js";
import { findActiveProfileDocument, findProfileDocumentById } from "../profile-documents/profile-document.repository.js";
import {
  createMeetingContext,
  deleteMeetingContext,
  findMeetingContextById,
  listMeetingContexts,
  updateMeetingContext
} from "./meeting-context.repository.js";

export async function getMeetingContextsForDevUser() {
  await ensureDevUser();
  return listMeetingContexts(DEV_USER_ID);
}

export async function getMeetingContextForDevUser(meetingContextId: string) {
  await ensureDevUser();
  return findMeetingContextById(DEV_USER_ID, meetingContextId);
}

export async function createMeetingContextForDevUser(input: CreateMeetingContextRequest) {
  await ensureDevUser();

  const activeProfileDocument = await findActiveProfileDocument(DEV_USER_ID);
  if (!activeProfileDocument) {
    throw new Error("Upload an active profile document before creating a meeting context.");
  }
  if (activeProfileDocument.processingStatus !== "ready") {
    throw new Error("Active profile document is not ready yet. Wait for AI processing or retry profile processing.");
  }

  const processedMeetingContext = await preprocessMeetingContext({
    ...input,
    profileDocumentReadyContext: activeProfileDocument.readyContext
  });

  return createMeetingContext(DEV_USER_ID, activeProfileDocument.id, {
    ...input,
    meetingSummaryJson: processedMeetingContext,
    meetingContextText: processedMeetingContext.result.contextText
  });
}

export async function updateMeetingContextForDevUser(meetingContextId: string, input: UpdateMeetingContextRequest) {
  await ensureDevUser();
  const existingMeetingContext = await findMeetingContextById(DEV_USER_ID, meetingContextId);
  if (!existingMeetingContext) {
    return null;
  }

  const contentChanged = Object.prototype.hasOwnProperty.call(input, "contextName")
    || Object.prototype.hasOwnProperty.call(input, "meetingTopic")
    || Object.prototype.hasOwnProperty.call(input, "meetingBrief");
  const profileDocumentChanged = Object.prototype.hasOwnProperty.call(input, "profileDocumentId");

  if (!contentChanged && !profileDocumentChanged) {
    return updateMeetingContext(DEV_USER_ID, meetingContextId, input);
  }

  const nextProfileDocumentId = input.profileDocumentId ?? existingMeetingContext.profileDocumentId;
  const linkedProfileDocument = await findProfileDocumentById(DEV_USER_ID, nextProfileDocumentId);
  if (!linkedProfileDocument) {
    throw new Error("Meeting context profile document not found.");
  }
  if (linkedProfileDocument.processingStatus !== "ready") {
    throw new Error("Meeting context profile document is not ready yet. Wait for AI processing or retry profile processing.");
  }

  if (!contentChanged) {
    return updateMeetingContext(DEV_USER_ID, meetingContextId, {
      ...input,
      profileDocumentId: linkedProfileDocument.id
    });
  }

  const nextMeetingContextInput: CreateMeetingContextRequest = {
    contextName: input.contextName ?? existingMeetingContext.contextName,
    meetingTopic: input.meetingTopic ?? existingMeetingContext.meetingTopic,
    meetingBrief: input.meetingBrief ?? existingMeetingContext.meetingBrief ?? undefined
  };
  const processedMeetingContext = await preprocessMeetingContext({
    ...nextMeetingContextInput,
    profileDocumentReadyContext: linkedProfileDocument.readyContext
  });

  return updateMeetingContext(DEV_USER_ID, meetingContextId, {
    ...input,
    profileDocumentId: linkedProfileDocument.id,
    meetingSummaryJson: processedMeetingContext,
    meetingContextText: processedMeetingContext.result.contextText
  });
}

export async function deleteMeetingContextForDevUser(meetingContextId: string) {
  await ensureDevUser();
  return deleteMeetingContext(DEV_USER_ID, meetingContextId);
}

async function preprocessMeetingContext(
  input: CreateMeetingContextRequest & { profileDocumentReadyContext?: string | null }
): Promise<PreprocessMeetingContextResult> {
  try {
    const result = await runOpenAiJsonAction({
      spec: preprocessMeetingContextSpec,
      input,
      outputSchema: preprocessMeetingContextResultSchema
    });

    return normalizeMeetingContextResult({
      ...result.output,
      warnings: [
        ...result.output.warnings,
        `AI metadata: ${result.metadata.actionId} ${result.metadata.promptVersion} using ${result.metadata.model}`
      ]
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown OpenAI meeting context preprocessing error";
    console.warn(`[ai:fallback] preprocess_meeting_context failed: ${message}`);
    return normalizeMeetingContextResult(buildFallbackMeetingContextResult(input, message));
  }
}

function normalizeMeetingContextResult(result: PreprocessMeetingContextResult): PreprocessMeetingContextResult {
  const domainProfile = result.result.domainProfile;
  return {
    ...result,
    result: {
      ...result.result,
      meetingSummary: truncateText(result.result.meetingSummary, 220),
      responsibilities: compactList(result.result.responsibilities, 8, 120),
      niceToHave: compactList(result.result.niceToHave, 8, 120),
      domainProfile: {
        ...domainProfile,
        primaryDomain: truncateText(domainProfile.primaryDomain, 90),
        nicheDescription: truncateSentences(domainProfile.nicheDescription, 2, 260),
        inScopeConcepts: compactList(domainProfile.inScopeConcepts, 8, 80),
        outOfScopeConcepts: compactList(domainProfile.outOfScopeConcepts, 5, 80),
        seedConcepts: compactList(domainProfile.seedConcepts, 5, 42),
        relevanceGuidance: truncateText(domainProfile.relevanceGuidance, 360)
      },
      preparationThemes: compactList(result.result.preparationThemes, 3, 90),
      contextText: truncateText(result.result.contextText, 1400)
    }
  };
}

function buildFallbackMeetingContextResult(
  input: CreateMeetingContextRequest & { profileDocumentReadyContext?: string | null },
  warning: string
): PreprocessMeetingContextResult {
  const briefPreview = input.meetingBrief?.slice(0, 220) || "Belum ada brief meeting.";
  const seedConcepts = extractFallbackConcepts(input.meetingBrief || input.meetingTopic);
  return {
    status: "partial",
    result: {
      meetingSummary: `${input.meetingTopic} - ${input.contextName}. Ringkasan brief: ${briefPreview}`,
      keyCriteria: [],
      responsibilities: input.meetingBrief ? extractFallbackConcepts(input.meetingBrief) : [],
      niceToHave: [],
      domainProfile: {
        primaryDomain: input.meetingTopic,
        nicheDescription: input.meetingBrief
          ? `Profil konteks sementara dibuat dari brief singkat: ${briefPreview}`
          : "Profil konteks belum kuat karena brief meeting belum tersedia.",
        inScopeConcepts: seedConcepts,
        outOfScopeConcepts: [],
        seedConcepts,
        relevanceGuidance: "Boundary relevansi runtime: topik sesi, brief meeting, dan konsep in-scope konteks ini."
      },
      preparationThemes: input.meetingBrief ? ["Klarifikasi tujuan utama sesi", "Hubungkan profil dengan kebutuhan meeting"] : [],
      contextText: `Konteks sementara untuk ${input.meetingTopic} - ${input.contextName}. Domain/niche masih partial. ${briefPreview}`
    },
    warnings: [`OpenAI meeting context preprocessing fallback: ${warning}`],
    missingInputs: input.meetingBrief ? [] : ["meetingBrief"],
    confidence: "low",
    evidence: []
  };
}

function extractFallbackConcepts(sourceText?: string) {
  const stopWords = new Set([
    "dan",
    "atau",
    "yang",
    "untuk",
    "dengan",
    "dalam",
    "pada",
    "sebagai",
    "akan",
    "the",
    "and",
    "for",
    "with",
    "from",
    "role",
    "job"
  ]);
  const source = sourceText || "";
  const phraseCandidates = source
    .split(/[.,;:\n\r()[\]{}]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 4 && item.length <= 48);
  const wordCandidates = source
    .split(/[^A-Za-z0-9+#.-]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 4 && !stopWords.has(item.toLowerCase()));

  return compactList(Array.from(new Set([...phraseCandidates, ...wordCandidates])), 5, 42);
}

function compactList(items: string[], maxItems: number, maxCharacters: number) {
  return Array.from(new Set(items.map((item) => truncateText(item, maxCharacters)).filter(Boolean)))
    .slice(0, maxItems);
}

function truncateSentences(value: string, maxSentences: number, maxCharacters: number) {
  const sentences = value
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, maxSentences)
    .join(" ");
  return truncateText(sentences || value, maxCharacters);
}

function truncateText(value: string, maxCharacters: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxCharacters) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxCharacters - 1)).trimEnd()}…`;
}
