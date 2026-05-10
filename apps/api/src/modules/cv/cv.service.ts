import { createWriteStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { MultipartFile } from "@fastify/multipart";
import { randomUUID } from "node:crypto";
import { ensureCvStorageDir, sanitizeFileName, cvStorageDir } from "../../lib/storage.js";
import { preprocessCvResultSchema, type PreprocessCvResult } from "../ai/action-schemas.js";
import { preprocessCvSpec } from "../ai/action-specs.js";
import { runOpenAiJsonAction } from "../ai/action-runner.js";
import { DEV_USER_ID } from "../dev/dev-user.js";
import { ensureDevUser } from "../dev/dev-user.repository.js";
import { createCv, findActiveCv, findCvById, listCvs, setActiveCv, updateCvProcessingState } from "./cv.repository.js";

const allowedMimeTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]);

export async function getCvListForDevUser() {
  await ensureDevUser();
  return listCvs(DEV_USER_ID);
}

export async function getActiveCvForDevUser() {
  await ensureDevUser();
  return findActiveCv(DEV_USER_ID);
}

export async function uploadCvForDevUser(file: MultipartFile) {
  await ensureDevUser();

  if (file.mimetype && !allowedMimeTypes.has(file.mimetype)) {
    throw new Error("Unsupported CV file type");
  }

  await ensureCvStorageDir();

  const safeName = sanitizeFileName(file.filename || "cv-upload");
  const storedFileName = `${Date.now()}-${randomUUID()}-${safeName}`;
  const filePath = path.join(cvStorageDir, storedFileName);

  await pipeline(file.file, createWriteStream(filePath));

  const createdCv = await createCv({
    userId: DEV_USER_ID,
    fileName: file.filename || safeName,
    filePath,
    fileMimeType: file.mimetype,
    processingStatus: "processing",
    processingError: null
  });

  queueCvProcessing({
    cvId: createdCv.id,
    fileName: createdCv.fileName,
    filePath: createdCv.filePath,
    fileMimeType: createdCv.fileMimeType
  });

  return createdCv;
}

export async function setActiveCvForDevUser(cvId: string) {
  await ensureDevUser();

  const existingCv = await findCvById(DEV_USER_ID, cvId);
  if (!existingCv) {
    return null;
  }

  return setActiveCv(DEV_USER_ID, cvId);
}

export async function retryCvProcessingForDevUser(cvId: string) {
  await ensureDevUser();

  const existingCv = await findCvById(DEV_USER_ID, cvId);
  if (!existingCv) {
    return null;
  }

  const processingCv = await updateCvProcessingState(DEV_USER_ID, cvId, {
    summaryJson: existingCv.summaryJson,
    readyContext: existingCv.readyContext,
    processingStatus: "processing",
    processingError: null
  });

  queueCvProcessing({
    cvId: existingCv.id,
    fileName: existingCv.fileName,
    filePath: existingCv.filePath,
    fileMimeType: existingCv.fileMimeType
  });

  return processingCv;
}

function queueCvProcessing(input: { cvId: string; fileName: string; filePath: string; fileMimeType?: string | null }) {
  void processCvInBackground(input).catch((error) => {
    const message = error instanceof Error ? error.message : "Unknown background CV processing error";
    console.warn(`[ai:fallback] background preprocess_cv failed: ${message}`);
  });
}

async function processCvInBackground(input: { cvId: string; fileName: string; filePath: string; fileMimeType?: string | null }) {
  const processedCv = await preprocessCv(input);
  await updateCvProcessingState(DEV_USER_ID, input.cvId, {
    summaryJson: processedCv,
    readyContext: processedCv.result.readyContext,
    processingStatus: processedCv.status === "success" || processedCv.status === "partial" ? "ready" : "failed",
    processingError: processedCv.status === "success" || processedCv.status === "partial" ? null : processedCv.warnings.join(" ")
  });
}

async function preprocessCv(input: { fileName: string; filePath: string; fileMimeType?: string | null }): Promise<PreprocessCvResult> {
  try {
    const result = await runOpenAiJsonAction({
      spec: preprocessCvSpec,
      input: {
        fileName: input.fileName,
        fileMimeType: input.fileMimeType
      },
      outputSchema: preprocessCvResultSchema,
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
    const message = error instanceof Error ? error.message : "Unknown OpenAI CV preprocessing error";
    console.warn(`[ai:fallback] preprocess_cv failed: ${message}`);
    return buildFailedCvResult(input.fileName, message);
  }
}

function buildFailedCvResult(fileName: string, warning: string): PreprocessCvResult {
  return {
    status: "insufficient_input",
    result: {
      candidateSummary: `CV ${fileName} sudah tersimpan, tetapi belum berhasil diproses AI.`,
      skills: [],
      relevantExperience: [],
      experiences: [],
      education: [],
      organizations: [],
      internships: [],
      strengthsForInterview: [],
      risks: ["Context CV masih terbatas karena preprocessing AI gagal."],
      readyContext: ""
    },
    warnings: [`OpenAI CV preprocessing fallback: ${warning}`],
    missingInputs: [],
    confidence: "low",
    evidence: []
  };
}
