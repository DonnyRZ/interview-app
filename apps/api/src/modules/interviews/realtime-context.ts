import type {
  InterviewStage,
  RealtimeCandidateEducation,
  RealtimeCandidateExperience,
  RealtimeCandidateInternship,
  RealtimeCandidateOrganization,
  RealtimeContext,
  RealtimeDomainProfile
} from "@interview-app/shared";
import type { applications, candidateCvs } from "../../db/schema/index.js";

type ApplicationRow = typeof applications.$inferSelect;
type CvRow = typeof candidateCvs.$inferSelect;

type CvAiEnvelope = {
  result?: {
    candidateSummary?: unknown;
    skills?: unknown;
    relevantExperience?: unknown;
    experiences?: unknown;
    education?: unknown;
    organizations?: unknown;
    internships?: unknown;
    strengthsForInterview?: unknown;
    risks?: unknown;
    readyContext?: unknown;
  };
};

type ApplicationAiEnvelope = {
  result?: {
    jdSummary?: unknown;
    roleRequirements?: unknown;
    responsibilities?: unknown;
    niceToHave?: unknown;
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
      experiences: experienceList(cvResult?.result?.experiences, 8),
      education: educationList(cvResult?.result?.education, 5),
      organizations: organizationList(cvResult?.result?.organizations, 5),
      internships: internshipList(cvResult?.result?.internships, 5),
      strengthsForInterview: stringList(cvResult?.result?.strengthsForInterview, 8),
      risks: stringList(cvResult?.result?.risks, 6)
    },
    applicationContext: {
      companyName: input.application.companyName,
      roleTitle: input.application.roleTitle,
      jdSummary: textValue(applicationResult?.result?.jdSummary) || input.application.jobDescription || "",
      roleRequirements: stringList(applicationResult?.result?.roleRequirements, 10),
      responsibilities: stringList(applicationResult?.result?.responsibilities, 10),
      niceToHave: stringList(applicationResult?.result?.niceToHave, 8),
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

function objectList(value: unknown, maxItems: number) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(readObject)
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .slice(0, maxItems);
}

function experienceList(value: unknown, maxItems: number): RealtimeCandidateExperience[] {
  return objectList(value, maxItems).map((item) => ({
    companyName: truncateText(textValue(item.companyName), 90),
    roleTitle: truncateText(textValue(item.roleTitle), 90),
    dateRange: truncateText(textValue(item.dateRange), 80),
    duration: truncateText(textValue(item.duration), 60),
    projects: stringList(item.projects, 6, 160),
    responsibilities: stringList(item.responsibilities, 6, 160),
    impact: stringList(item.impact, 6, 160),
    technologies: stringList(item.technologies, 10, 60)
  }));
}

function educationList(value: unknown, maxItems: number): RealtimeCandidateEducation[] {
  return objectList(value, maxItems).map((item) => ({
    institution: truncateText(textValue(item.institution), 100),
    degree: truncateText(textValue(item.degree), 80),
    major: truncateText(textValue(item.major), 90),
    dateRange: truncateText(textValue(item.dateRange), 80),
    notes: stringList(item.notes, 4, 140)
  }));
}

function organizationList(value: unknown, maxItems: number): RealtimeCandidateOrganization[] {
  return objectList(value, maxItems).map((item) => ({
    organizationName: truncateText(textValue(item.organizationName), 100),
    roleTitle: truncateText(textValue(item.roleTitle), 90),
    dateRange: truncateText(textValue(item.dateRange), 80),
    responsibilities: stringList(item.responsibilities, 5, 140)
  }));
}

function internshipList(value: unknown, maxItems: number): RealtimeCandidateInternship[] {
  return objectList(value, maxItems).map((item) => ({
    companyName: truncateText(textValue(item.companyName), 90),
    roleTitle: truncateText(textValue(item.roleTitle), 90),
    dateRange: truncateText(textValue(item.dateRange), 80),
    duration: truncateText(textValue(item.duration), 60),
    responsibilities: stringList(item.responsibilities, 5, 140),
    projects: stringList(item.projects, 5, 140)
  }));
}

function truncateText(value: string, maxCharacters: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxCharacters) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxCharacters - 1)).trimEnd()}...`;
}
