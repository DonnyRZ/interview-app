import type {
  MeetingSessionType,
  RealtimeContext,
  RealtimeDomainProfile,
  RealtimeUserEducation,
  RealtimeUserExperience,
  RealtimeUserInternship,
  RealtimeUserOrganization
} from "@interview-app/shared";
import type { meetingContexts, profileDocuments } from "../../db/schema/index.js";

type MeetingContextRow = typeof meetingContexts.$inferSelect;
type ProfileDocumentRow = typeof profileDocuments.$inferSelect;

type ProfileDocumentAiEnvelope = {
  result?: {
    userProfileSummary?: unknown;
    skills?: unknown;
    relevantExperience?: unknown;
    experiences?: unknown;
    education?: unknown;
    organizations?: unknown;
    internships?: unknown;
    usefulStrengths?: unknown;
    risks?: unknown;
    readyContext?: unknown;
  };
};

type MeetingContextAiEnvelope = {
  result?: {
    meetingSummary?: unknown;
    keyCriteria?: unknown;
    responsibilities?: unknown;
    niceToHave?: unknown;
    domainProfile?: Partial<RealtimeDomainProfile>;
    preparationThemes?: unknown;
    contextText?: unknown;
  };
};

export function buildRealtimeContext(input: {
  profileDocument: ProfileDocumentRow;
  meetingContext: MeetingContextRow;
  sessionType: MeetingSessionType;
}): RealtimeContext {
  const profileDocumentResult = readObject(input.profileDocument.summaryJson) as ProfileDocumentAiEnvelope | null;
  const meetingContextResult = readObject(input.meetingContext.meetingSummaryJson) as MeetingContextAiEnvelope | null;
  const profileReadyContext = textValue(profileDocumentResult?.result?.readyContext) || input.profileDocument.readyContext || "";
  const contextText = textValue(meetingContextResult?.result?.contextText) || input.meetingContext.meetingContextText || "";
  const domainProfile = normalizeDomainProfile(meetingContextResult?.result?.domainProfile, input.meetingContext);

  return {
    userProfileContext: {
      summary: textValue(profileDocumentResult?.result?.userProfileSummary) || profileReadyContext,
      readyContext: profileReadyContext,
      skills: stringList(profileDocumentResult?.result?.skills, 12),
      relevantExperience: stringList(profileDocumentResult?.result?.relevantExperience, 8),
      experiences: experienceList(profileDocumentResult?.result?.experiences, 8),
      education: educationList(profileDocumentResult?.result?.education, 5),
      organizations: organizationList(profileDocumentResult?.result?.organizations, 5),
      internships: internshipList(profileDocumentResult?.result?.internships, 5),
      usefulStrengths: stringList(profileDocumentResult?.result?.usefulStrengths, 8),
      risks: stringList(profileDocumentResult?.result?.risks, 6)
    },
    meetingContext: {
      contextName: input.meetingContext.contextName,
      meetingTopic: input.meetingContext.meetingTopic,
      meetingSummary: textValue(meetingContextResult?.result?.meetingSummary) || input.meetingContext.meetingBrief || "",
      keyCriteria: stringList(meetingContextResult?.result?.keyCriteria, 10),
      responsibilities: stringList(meetingContextResult?.result?.responsibilities, 10),
      niceToHave: stringList(meetingContextResult?.result?.niceToHave, 8),
      preparationThemes: stringList(meetingContextResult?.result?.preparationThemes, 5),
      contextText
    },
    domainProfile,
    sessionContext: {
      sessionType: input.sessionType,
      focus: getStageFocus(input.sessionType)
    }
  };
}

function normalizeDomainProfile(
  profile: Partial<RealtimeDomainProfile> | undefined,
  meetingContext: MeetingContextRow
): RealtimeDomainProfile {
  return {
    primaryDomain: truncateText(profile?.primaryDomain || meetingContext.meetingTopic, 90),
    nicheDescription: truncateText(profile?.nicheDescription || "Domain profile belum cukup tajam.", 260),
    inScopeConcepts: stringList(profile?.inScopeConcepts, 8),
    outOfScopeConcepts: stringList(profile?.outOfScopeConcepts, 5),
    seedConcepts: stringList(profile?.seedConcepts, 5, 42),
    relevanceGuidance: truncateText(
      profile?.relevanceGuidance || "Boundary relevansi runtime: topik sesi, brief meeting, dan konsep in-scope konteks ini.",
      360
    )
  };
}

function getStageFocus(sessionType: MeetingSessionType) {
  if (sessionType === "HR") {
    return ["motivation", "communication", "culture fit", "availability", "salary expectation"];
  }
  if (sessionType === "TECHNICAL") {
    return ["role skills", "technical depth", "problem solving", "project evidence", "trade-offs"];
  }
  if (sessionType === "USER") {
    return ["workflow", "business impact", "stakeholder collaboration", "metrics", "practical examples"];
  }
  if (sessionType === "FINAL") {
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

function experienceList(value: unknown, maxItems: number): RealtimeUserExperience[] {
  return objectList(value, maxItems).map((item) => ({
    organizationName: truncateText(textValue(item.organizationName), 90),
    roleTitle: truncateText(textValue(item.roleTitle), 90),
    dateRange: truncateText(textValue(item.dateRange), 80),
    duration: truncateText(textValue(item.duration), 60),
    projects: stringList(item.projects, 6, 160),
    responsibilities: stringList(item.responsibilities, 6, 160),
    impact: stringList(item.impact, 6, 160),
    technologies: stringList(item.technologies, 10, 60)
  }));
}

function educationList(value: unknown, maxItems: number): RealtimeUserEducation[] {
  return objectList(value, maxItems).map((item) => ({
    institution: truncateText(textValue(item.institution), 100),
    degree: truncateText(textValue(item.degree), 80),
    major: truncateText(textValue(item.major), 90),
    dateRange: truncateText(textValue(item.dateRange), 80),
    notes: stringList(item.notes, 4, 140)
  }));
}

function organizationList(value: unknown, maxItems: number): RealtimeUserOrganization[] {
  return objectList(value, maxItems).map((item) => ({
    organizationName: truncateText(textValue(item.organizationName), 100),
    roleTitle: truncateText(textValue(item.roleTitle), 90),
    dateRange: truncateText(textValue(item.dateRange), 80),
    responsibilities: stringList(item.responsibilities, 5, 140)
  }));
}

function internshipList(value: unknown, maxItems: number): RealtimeUserInternship[] {
  return objectList(value, maxItems).map((item) => ({
    organizationName: truncateText(textValue(item.organizationName), 90),
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
