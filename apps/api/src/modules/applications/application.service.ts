import type { CreateApplicationRequest, UpdateApplicationRequest } from "@interview-app/shared";
import { preprocessApplicationJdResultSchema, type PreprocessApplicationJdResult } from "../ai/action-schemas.js";
import { preprocessApplicationJdSpec } from "../ai/action-specs.js";
import { runOpenAiJsonAction } from "../ai/action-runner.js";
import { DEV_USER_ID } from "../dev/dev-user.js";
import { ensureDevUser } from "../dev/dev-user.repository.js";
import { findActiveCv } from "../cv/cv.repository.js";
import {
  createApplication,
  deleteApplication,
  findApplicationById,
  listApplications,
  updateApplication
} from "./application.repository.js";

export async function getApplicationsForDevUser() {
  await ensureDevUser();
  return listApplications(DEV_USER_ID);
}

export async function getApplicationForDevUser(applicationId: string) {
  await ensureDevUser();
  return findApplicationById(DEV_USER_ID, applicationId);
}

export async function createApplicationForDevUser(input: CreateApplicationRequest) {
  await ensureDevUser();

  const activeCv = await findActiveCv(DEV_USER_ID);
  if (!activeCv) {
    throw new Error("Upload an active CV before creating an application");
  }
  if (activeCv.processingStatus !== "ready") {
    throw new Error("Active CV is not ready yet. Wait for AI processing or retry CV processing.");
  }

  const processedApplication = await preprocessApplicationJd({
    ...input,
    cvReadyContext: activeCv.readyContext
  });

  return createApplication(DEV_USER_ID, activeCv.id, {
    ...input,
    jobSummaryJson: processedApplication,
    companyContext: processedApplication.result.applicationContext
  });
}

export async function updateApplicationForDevUser(applicationId: string, input: UpdateApplicationRequest) {
  await ensureDevUser();
  return updateApplication(DEV_USER_ID, applicationId, input);
}

export async function deleteApplicationForDevUser(applicationId: string) {
  await ensureDevUser();
  return deleteApplication(DEV_USER_ID, applicationId);
}

async function preprocessApplicationJd(
  input: CreateApplicationRequest & { cvReadyContext?: string | null }
): Promise<PreprocessApplicationJdResult> {
  try {
    const result = await runOpenAiJsonAction({
      spec: preprocessApplicationJdSpec,
      input,
      outputSchema: preprocessApplicationJdResultSchema
    });

    return normalizeApplicationResult({
      ...result.output,
      warnings: [
        ...result.output.warnings,
        `AI metadata: ${result.metadata.actionId} ${result.metadata.promptVersion} using ${result.metadata.model}`
      ]
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown OpenAI JD preprocessing error";
    console.warn(`[ai:fallback] preprocess_application_jd failed: ${message}`);
    return normalizeApplicationResult(buildFallbackApplicationResult(input, message));
  }
}

function normalizeApplicationResult(result: PreprocessApplicationJdResult): PreprocessApplicationJdResult {
  const domainProfile = result.result.domainProfile;
  return {
    ...result,
    result: {
      ...result.result,
      jdSummary: truncateText(result.result.jdSummary, 220),
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
      interviewPrepThemes: compactList(result.result.interviewPrepThemes, 3, 90),
      applicationContext: truncateText(result.result.applicationContext, 1400)
    }
  };
}

function buildFallbackApplicationResult(
  input: CreateApplicationRequest & { cvReadyContext?: string | null },
  warning: string
): PreprocessApplicationJdResult {
  const jdPreview = input.jobDescription?.slice(0, 220) || "Belum ada job description.";
  const seedConcepts = extractFallbackConcepts(input.jobDescription || input.roleTitle);
  return {
    status: "partial",
    result: {
      jdSummary: `${input.roleTitle} di ${input.companyName}. JD preview: ${jdPreview}`,
      roleRequirements: [],
      responsibilities: input.jobDescription ? extractFallbackConcepts(input.jobDescription) : [],
      niceToHave: [],
      domainProfile: {
        primaryDomain: input.roleTitle,
        nicheDescription: input.jobDescription
          ? `Profil niche sementara dibuat dari JD singkat: ${jdPreview}`
          : "Profil niche belum kuat karena job description belum tersedia.",
        inScopeConcepts: seedConcepts,
        outOfScopeConcepts: [],
        seedConcepts,
        relevanceGuidance: "Boundary relevansi runtime: role, JD, dan konsep in-scope application ini."
      },
      interviewPrepThemes: input.jobDescription ? ["Klarifikasi tanggung jawab utama role", "Hubungkan pengalaman CV dengan kebutuhan JD"] : [],
      applicationContext: `Context sementara untuk ${input.roleTitle} di ${input.companyName}. Domain/niche masih partial. ${jdPreview}`
    },
    warnings: [`OpenAI application preprocessing fallback: ${warning}`],
    missingInputs: input.jobDescription ? [] : ["jobDescription"],
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
