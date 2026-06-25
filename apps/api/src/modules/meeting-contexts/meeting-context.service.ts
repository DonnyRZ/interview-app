import type { CreateMeetingContextRequest, UpdateMeetingContextRequest } from "@interview-app/shared";
import { preprocessMeetingContextResultSchema, type PreprocessMeetingContextResult } from "../ai/action-schemas.js";
import { preprocessMeetingContextSpec } from "../ai/action-specs.js";
import { runOpenAiJsonAction } from "../ai/action-runner.js";
import { findActiveProfileDocument, findProfileDocumentById } from "../profile-documents/profile-document.repository.js";
import {
  createMeetingContext,
  deleteMeetingContext,
  findMeetingContextById,
  listMeetingContexts,
  updateMeetingContext
} from "./meeting-context.repository.js";

export async function getMeetingContextsForUser(userId: string, pagination?: { limit: number; offset: number }) {
  return listMeetingContexts(userId, pagination);
}

export async function getMeetingContextForUser(userId: string, meetingContextId: string) {
  return findMeetingContextById(userId, meetingContextId);
}

export async function createMeetingContextForUser(userId: string, input: CreateMeetingContextRequest) {
  const activeProfileDocument = await findActiveProfileDocument(userId);
  if (!activeProfileDocument) {
    throw new Error("Upload an active profile document before creating a meeting context.");
  }
  if (activeProfileDocument.processingStatus !== "ready") {
    throw new Error("Active profile document is not ready yet. Wait for AI processing or retry profile processing.");
  }

  const processedMeetingContext = await preprocessMeetingContext({
    userId,
    ...input,
    profileDocumentReadyContext: activeProfileDocument.readyContext
  });

  return createMeetingContext(userId, activeProfileDocument.id, {
    ...input,
    meetingSummaryJson: processedMeetingContext,
    meetingContextText: processedMeetingContext.result.contextText
  });
}

export async function updateMeetingContextForUser(userId: string, meetingContextId: string, input: UpdateMeetingContextRequest) {
  const existingMeetingContext = await findMeetingContextById(userId, meetingContextId);
  if (!existingMeetingContext) {
    return null;
  }

  const contentChanged = Object.prototype.hasOwnProperty.call(input, "contextName")
    || Object.prototype.hasOwnProperty.call(input, "meetingTopic")
    || Object.prototype.hasOwnProperty.call(input, "meetingBrief");
  const profileDocumentChanged = Object.prototype.hasOwnProperty.call(input, "profileDocumentId");

  if (!contentChanged && !profileDocumentChanged) {
    return updateMeetingContext(userId, meetingContextId, input);
  }

  const nextProfileDocumentId = input.profileDocumentId ?? existingMeetingContext.profileDocumentId;
  const linkedProfileDocument = await findProfileDocumentById(userId, nextProfileDocumentId);
  if (!linkedProfileDocument) {
    throw new Error("Meeting context profile document not found.");
  }
  if (linkedProfileDocument.processingStatus !== "ready") {
    throw new Error("Meeting context profile document is not ready yet. Wait for AI processing or retry profile processing.");
  }

  if (!contentChanged) {
    return updateMeetingContext(userId, meetingContextId, {
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
    userId,
    ...nextMeetingContextInput,
    profileDocumentReadyContext: linkedProfileDocument.readyContext
  });

  return updateMeetingContext(userId, meetingContextId, {
    ...input,
    profileDocumentId: linkedProfileDocument.id,
    meetingSummaryJson: processedMeetingContext,
    meetingContextText: processedMeetingContext.result.contextText
  });
}

export async function deleteMeetingContextForUser(userId: string, meetingContextId: string) {
  return deleteMeetingContext(userId, meetingContextId);
}

async function preprocessMeetingContext(
  input: CreateMeetingContextRequest & { userId: string; profileDocumentReadyContext?: string | null }
): Promise<PreprocessMeetingContextResult> {
  try {
    const result = await runOpenAiJsonAction({
      spec: preprocessMeetingContextSpec,
      input,
      outputSchema: preprocessMeetingContextResultSchema,
      userId: input.userId,
      usageCapability: "meeting_context_preprocessing"
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
    console.warn(`[ai:evidence-fallback] preprocess_meeting_context failed: ${message}`);
    return buildEvidenceOnlyMeetingContextFallback(input, message);
  }
}

function buildEvidenceOnlyMeetingContextFallback(
  input: CreateMeetingContextRequest & { profileDocumentReadyContext?: string | null },
  warning: string
): PreprocessMeetingContextResult {
  const providedBrief = input.meetingBrief?.replace(/\s+/g, " ").trim() || "";
  const providedSummary = [input.contextName, input.meetingTopic, providedBrief].filter(Boolean).join(" — ");
  return normalizeMeetingContextResult({
    status: "partial",
    result: {
      meetingSummary: providedSummary,
      keyCriteria: [],
      responsibilities: [],
      niceToHave: [],
      domainProfile: {
        primaryDomain: input.meetingTopic,
        nicheDescription: providedBrief,
        inScopeConcepts: [],
        outOfScopeConcepts: [],
        seedConcepts: [],
        relevanceGuidance: ""
      },
      preparationThemes: [],
      contextText: providedSummary
    },
    warnings: [`AI processing gagal; konteks ini hanya memakai input user: ${warning}`],
    missingInputs: providedBrief ? [] : ["meetingBrief"],
    confidence: "low",
    evidence: [
      { field: "contextName", source: "user_input", quote: input.contextName },
      { field: "meetingTopic", source: "user_input", quote: input.meetingTopic },
      ...(providedBrief ? [{ field: "meetingBrief", source: "user_input", quote: providedBrief }] : [])
    ]
  });
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
