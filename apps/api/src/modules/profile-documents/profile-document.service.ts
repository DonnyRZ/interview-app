import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { MultipartFile } from "@fastify/multipart";
import { randomUUID } from "node:crypto";
import { ensureProfileDocumentStorageDir, sanitizeFileName, profileDocumentStorageDir } from "../../lib/storage.js";
import { preprocessProfileDocumentResultSchema, type PreprocessProfileDocumentResult } from "../ai/action-schemas.js";
import { preprocessProfileDocumentSpec } from "../ai/action-specs.js";
import { runOpenAiJsonAction } from "../ai/action-runner.js";
import {
  createProfileDocument,
  deleteProfileDocument,
  findActiveProfileDocument,
  findMeetingContextUsingProfileDocument,
  findProfileDocumentById,
  findLatestReadyProfileDocumentExcluding,
  listProfileDocuments,
  setActiveProfileDocument,
  updateProfileDocumentProcessingState
} from "./profile-document.repository.js";

const allowedMimeTypes = new Set([
  "application/pdf"
]);

export async function getProfileDocumentListForUser(userId: string) {
  return listProfileDocuments(userId);
}

export async function getActiveProfileDocumentForUser(userId: string) {
  return findActiveProfileDocument(userId);
}

export async function uploadProfileDocumentForUser(userId: string, file: MultipartFile) {
  if (file.mimetype && !allowedMimeTypes.has(file.mimetype)) {
    throw new Error("Unsupported profile document file type. Upload profil saat ini hanya mendukung PDF.");
  }

  await ensureProfileDocumentStorageDir();

  const safeName = sanitizeFileName(file.filename || "profile-document-upload");
  const storedFileName = `${Date.now()}-${randomUUID()}-${safeName}`;
  const filePath = path.join(profileDocumentStorageDir, storedFileName);

  await pipeline(file.file, createWriteStream(filePath));

  let createdProfileDocument;
  try {
    createdProfileDocument = await createProfileDocument({
      userId,
      fileName: file.filename || safeName,
      filePath,
      fileMimeType: file.mimetype,
      processingStatus: "processing",
      processingError: null
    });
  } catch (error) {
    await unlink(filePath).catch((cleanupError) => {
      const message = cleanupError instanceof Error ? cleanupError.message : "Unknown profile document file cleanup error";
      console.warn(`[profile:cleanup] failed to delete uploaded profile document after DB insert failure: ${message}`);
    });
    throw error;
  }

  queueProfileDocumentProcessing({
    userId,
    profileDocumentId: createdProfileDocument.id,
    fileName: createdProfileDocument.fileName,
    filePath: createdProfileDocument.filePath,
    fileMimeType: createdProfileDocument.fileMimeType
  });

  return createdProfileDocument;
}

export async function setActiveProfileDocumentForUser(userId: string, profileDocumentId: string) {
  const existingProfileDocument = await findProfileDocumentById(userId, profileDocumentId);
  if (!existingProfileDocument) {
    return null;
  }

  return setActiveProfileDocument(userId, profileDocumentId);
}

export async function retryProfileDocumentProcessingForUser(userId: string, profileDocumentId: string) {
  const existingProfileDocument = await findProfileDocumentById(userId, profileDocumentId);
  if (!existingProfileDocument) {
    return null;
  }

  const processingProfileDocument = await updateProfileDocumentProcessingState(userId, profileDocumentId, {
    summaryJson: existingProfileDocument.summaryJson,
    readyContext: existingProfileDocument.readyContext,
    processingStatus: "processing",
    processingError: null
  });

  queueProfileDocumentProcessing({
    userId,
    profileDocumentId: existingProfileDocument.id,
    fileName: existingProfileDocument.fileName,
    filePath: existingProfileDocument.filePath,
    fileMimeType: existingProfileDocument.fileMimeType
  });

  return processingProfileDocument;
}

export async function deleteProfileDocumentForUser(userId: string, profileDocumentId: string) {
  const existingProfileDocument = await findProfileDocumentById(userId, profileDocumentId);
  if (!existingProfileDocument) {
    return null;
  }

  const linkedMeetingContext = await findMeetingContextUsingProfileDocument(userId, profileDocumentId);
  if (linkedMeetingContext) {
    throw new Error("Profile document is still linked to a meeting context and cannot be deleted.");
  }

  const replacementProfileDocument = existingProfileDocument.isActive ? await findLatestReadyProfileDocumentExcluding(userId, profileDocumentId) : null;

  const deletedProfileDocument = await deleteProfileDocument(userId, profileDocumentId);
  if (!deletedProfileDocument) {
    return null;
  }

  if (replacementProfileDocument) {
    await setActiveProfileDocument(userId, replacementProfileDocument.id);
  }

  await unlink(deletedProfileDocument.filePath).catch((error) => {
    const message = error instanceof Error ? error.message : "Unknown profile document file cleanup error";
    console.warn(`[profile:cleanup] failed to delete uploaded profile document file: ${message}`);
  });

  return deletedProfileDocument;
}

function queueProfileDocumentProcessing(input: {
  userId: string;
  profileDocumentId: string;
  fileName: string;
  filePath: string;
  fileMimeType?: string | null;
}) {
  void processProfileDocumentInBackground(input).catch((error) => {
    const message = error instanceof Error ? error.message : "Unknown background profile document processing error";
    console.warn(`[ai:fallback] background preprocess_user_profile failed: ${message}`);
  });
}

async function processProfileDocumentInBackground(input: {
  userId: string;
  profileDocumentId: string;
  fileName: string;
  filePath: string;
  fileMimeType?: string | null;
}) {
  const processedProfileDocument = await preprocessProfileDocument(input);
  await updateProfileDocumentProcessingState(input.userId, input.profileDocumentId, {
    summaryJson: processedProfileDocument,
    readyContext: processedProfileDocument.result.readyContext,
    processingStatus: processedProfileDocument.status === "success" || processedProfileDocument.status === "partial" ? "ready" : "failed",
    processingError: processedProfileDocument.status === "success" || processedProfileDocument.status === "partial" ? null : processedProfileDocument.warnings.join(" ")
  });
}

async function preprocessProfileDocument(input: { fileName: string; filePath: string; fileMimeType?: string | null }): Promise<PreprocessProfileDocumentResult> {
  try {
    const result = await runOpenAiJsonAction({
      spec: preprocessProfileDocumentSpec,
      input: {
        fileName: input.fileName,
        fileMimeType: input.fileMimeType
      },
      outputSchema: preprocessProfileDocumentResultSchema,
      inlineFile: input.fileMimeType
        ? {
          filePath: input.filePath,
          mimeType: input.fileMimeType
        }
        : undefined
    });

    return {
      ...result.output,
      warnings: [
        ...result.output.warnings,
        `AI metadata: ${result.metadata.actionId} ${result.metadata.promptVersion} using ${result.metadata.model}`
      ]
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown OpenAI profile document preprocessing error";
    console.warn(`[ai:fallback] preprocess_user_profile failed: ${message}`);
    return buildFailedProfileDocumentResult(input.fileName, message);
  }
}

function buildFailedProfileDocumentResult(fileName: string, warning: string): PreprocessProfileDocumentResult {
  return {
    status: "insufficient_input",
    result: {
      userProfileSummary: `Dokumen profil ${fileName} sudah tersimpan, tetapi belum berhasil diproses AI.`,
      skills: [],
      relevantExperience: [],
      experiences: [],
      education: [],
      organizations: [],
      internships: [],
      usefulStrengths: [],
      risks: ["Konteks profil masih terbatas karena preprocessing AI gagal."],
      readyContext: ""
    },
    warnings: [`OpenAI profile document preprocessing fallback: ${warning}`],
    missingInputs: [],
    confidence: "low",
    evidence: []
  };
}
