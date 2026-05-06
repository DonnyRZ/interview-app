import type { InterviewStage, RealtimeContext, RealtimeDomainProfile } from "@interview-app/shared";
import type { applications, candidateCvs } from "../../db/schema/index.js";

type ApplicationRow = typeof applications.$inferSelect;
type CvRow = typeof candidateCvs.$inferSelect;

type CvAiEnvelope = {
  result?: {
    candidateSummary?: unknown;
    skills?: unknown;
    relevantExperience?: unknown;
    strengthsForInterview?: unknown;
    risks?: unknown;
    readyContext?: unknown;
  };
};

type ApplicationAiEnvelope = {
  result?: {
    jdSummary?: unknown;
    roleRequirements?: unknown;
    domainProfile?: Partial<RealtimeDomainProfile>;
    interviewPrepThemes?: unknown;
    applicationContext?: unknown;
  };
};

export function buildRealtimeContext(input: {
  cv: CvRow;
  application: ApplicationRow;
  stageType: InterviewStage;
}): RealtimeContext {
  const cvResult = readObject(input.cv.summaryJson) as CvAiEnvelope | null;
  const applicationResult = readObject(input.application.jobSummaryJson) as ApplicationAiEnvelope | null;
  const candidateReadyContext = textValue(cvResult?.result?.readyContext) || input.cv.readyContext || "";
  const applicationContext = textValue(applicationResult?.result?.applicationContext) || input.application.companyContext || "";
  const domainProfile = normalizeDomainProfile(applicationResult?.result?.domainProfile, input.application);

  return {
    candidateContext: {
      summary: textValue(cvResult?.result?.candidateSummary) || candidateReadyContext,
      readyContext: candidateReadyContext,
      skills: stringList(cvResult?.result?.skills, 12),
      relevantExperience: stringList(cvResult?.result?.relevantExperience, 8),
      strengthsForInterview: stringList(cvResult?.result?.strengthsForInterview, 8),
      risks: stringList(cvResult?.result?.risks, 6)
    },
    applicationContext: {
      companyName: input.application.companyName,
      roleTitle: input.application.roleTitle,
      jdSummary: textValue(applicationResult?.result?.jdSummary) || input.application.jobDescription || "",
      roleRequirements: stringList(applicationResult?.result?.roleRequirements, 10),
      interviewPrepThemes: stringList(applicationResult?.result?.interviewPrepThemes, 5),
      applicationContext
    },
    domainProfile,
    stageContext: {
      stageType: input.stageType,
      focus: getStageFocus(input.stageType)
    }
  };
}

function normalizeDomainProfile(
  profile: Partial<RealtimeDomainProfile> | undefined,
  application: ApplicationRow
): RealtimeDomainProfile {
  return {
    primaryDomain: truncateText(profile?.primaryDomain || application.roleTitle, 90),
    nicheDescription: truncateText(profile?.nicheDescription || "Domain profile belum cukup tajam.", 260),
    inScopeConcepts: stringList(profile?.inScopeConcepts, 8),
    outOfScopeConcepts: stringList(profile?.outOfScopeConcepts, 5),
    seedConcepts: stringList(profile?.seedConcepts, 5, 42),
    relevanceGuidance: truncateText(
      profile?.relevanceGuidance || "Boundary relevansi runtime: role, JD, dan konsep in-scope application ini.",
      360
    )
  };
}

function getStageFocus(stageType: InterviewStage) {
  if (stageType === "HR") {
    return ["motivation", "communication", "culture fit", "availability", "salary expectation"];
  }
  if (stageType === "TECHNICAL") {
    return ["role skills", "technical depth", "problem solving", "project evidence", "trade-offs"];
  }
  if (stageType === "USER") {
    return ["workflow", "business impact", "stakeholder collaboration", "metrics", "practical examples"];
  }
  if (stageType === "FINAL") {
    return ["decision fit", "scope alignment", "commitment", "closing questions", "next steps"];
  }
  return ["role fit", "clarification", "examples", "metrics", "next steps"];
}

function readObject(value: unknown) {
  return value && typeof value === "object" ? value : null;
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringList(value: unknown, maxItems: number, maxCharacters = 180) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value
    .filter((item): item is string => typeof item === "string")
    .map((item) => truncateText(item, maxCharacters))
    .filter(Boolean)))
    .slice(0, maxItems);
}

function truncateText(value: string, maxCharacters: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxCharacters) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxCharacters - 1)).trimEnd()}...`;
}
