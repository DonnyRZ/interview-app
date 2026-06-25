import type { RealtimeContext } from "@interview-app/shared";

export const meetingContextUsagePolicy = [
  "Choose context adaptively before responding.",
  "If the meeting context can be answered from general knowledge or the latest conversation, respond directly without forcing profile or session context.",
  "Use user profile or identity reference only when the other speaker asks about the user, their background, experience, responsibility, preference, constraint, or personal/team context.",
  "Use session context only when the other speaker discusses the meeting topic, goals, scope, constraints, decision criteria, shared documents, or next steps.",
  "When the conversation is a reaction, concern, feedback, update, story, disagreement, or implied pressure, prioritize the latest transcript and a safe general response.",
  "Never mention companies, projects, numbers, dates, credentials, responsibilities, or session details that are not available in runtime context.",
  "Do not overfit to any single meeting type; follow the latest speaker intent and the evidence in runtime data.",
  "If current external facts are needed and no search result is provided, do not invent them; answer cautiously and suggest checking the relevant data."
];

export function formatMeetingContextForPrompt(context: RealtimeContext) {
  return `- userProfile:
  - summary: ${context.userProfileContext.summary || "unknown"}
  - reusableContext: ${context.userProfileContext.readyContext || "unknown"}
  - skillsOrCapabilities: ${joinList(context.userProfileContext.skills)}
  - relevantBackground: ${joinList(context.userProfileContext.relevantExperience)}
  - structuredBackground:
${formatExperiences(context.userProfileContext.experiences)}
  - education:
${formatEducation(context.userProfileContext.education)}
  - organizations:
${formatOrganizations(context.userProfileContext.organizations)}
  - internshipsOrEarlyExperience:
${formatInternships(context.userProfileContext.internships)}
  - usefulStrengths: ${joinList(context.userProfileContext.usefulStrengths)}
  - knownRisksOrGaps: ${joinList(context.userProfileContext.risks)}

- meetingContext:
  - organizationOrCounterparty: ${context.meetingContext.contextName || "unknown"}
  - sessionTitleOrTopic: ${context.meetingContext.meetingTopic || "unknown"}
  - sessionSummary: ${context.meetingContext.meetingSummary || "unknown"}
  - keyRequirementsOrCriteria: ${joinList(context.meetingContext.keyCriteria)}
  - responsibilitiesOrScope: ${joinList(context.meetingContext.responsibilities)}
  - optionalConsiderations: ${joinList(context.meetingContext.niceToHave)}
  - preparationThemes: ${joinList(context.meetingContext.preparationThemes)}
  - sessionContext: ${context.meetingContext.contextText || "unknown"}

- domainProfile:
  - primaryDomain: ${context.domainProfile.primaryDomain || "unknown"}
  - domainDescription: ${context.domainProfile.nicheDescription || "unknown"}
  - inScopeConcepts: ${joinList(context.domainProfile.inScopeConcepts)}
  - outOfScopeConcepts: ${joinList(context.domainProfile.outOfScopeConcepts)}
  - seedConcepts: ${joinList(context.domainProfile.seedConcepts)}
  - relevanceGuidance: ${context.domainProfile.relevanceGuidance || "unknown"}

- liveSession:
  - legacySessionType: ${context.sessionContext.sessionType}
  - focusHints: ${joinList(context.sessionContext.focus)}`;
}

export function formatRealtimeMeetingContextForPrompt(context: RealtimeContext) {
  return [
    `profile: ${compactParts([
      context.userProfileContext.summary,
      context.userProfileContext.readyContext,
      joinList(context.userProfileContext.skills),
      joinList(context.userProfileContext.relevantExperience),
      joinList(context.userProfileContext.usefulStrengths)
    ], 900)}`,
    `meeting: ${compactParts([
      context.meetingContext.contextName,
      context.meetingContext.meetingTopic,
      context.meetingContext.meetingSummary,
      joinList(context.meetingContext.keyCriteria),
      joinList(context.meetingContext.responsibilities),
      context.meetingContext.contextText
    ], 760)}`,
    `domain: ${compactParts([
      context.domainProfile.primaryDomain,
      context.domainProfile.nicheDescription,
      joinList(context.domainProfile.inScopeConcepts),
      context.domainProfile.relevanceGuidance
    ], 420)}`,
    `session: ${context.sessionContext.sessionType}; focus=${joinList(context.sessionContext.focus)}`
  ].join("\n");
}

function joinList(items: string[]) {
  return items.map((item) => item.trim()).filter(Boolean).join(", ") || "none";
}

function compactParts(parts: Array<string | undefined>, maxCharacters: number) {
  const compacted = parts
    .map((part) => (part || "").replace(/\s+/g, " ").trim())
    .filter((part) => part && part !== "none")
    .join(" | ");
  return compacted.length <= maxCharacters ? compacted : compacted.slice(0, maxCharacters).trim();
}

function formatExperiences(items: RealtimeContext["userProfileContext"]["experiences"]) {
  if (!items.length) return "    none";
  return items.map((item) => [
    `    - ${item.roleTitle || "Role"} at ${item.organizationName || "organization"} (${item.dateRange || item.duration || "date unknown"})`,
    item.projects.length ? `      projects: ${joinList(item.projects)}` : "",
    item.responsibilities.length ? `      responsibilities: ${joinList(item.responsibilities)}` : "",
    item.impact.length ? `      impact: ${joinList(item.impact)}` : "",
    item.technologies.length ? `      toolsOrMethods: ${joinList(item.technologies)}` : ""
  ].filter(Boolean).join("\n")).join("\n");
}

function formatEducation(items: RealtimeContext["userProfileContext"]["education"]) {
  if (!items.length) return "    none";
  return items.map((item) => [
    `    - ${item.institution || "Institution"}${item.major ? `, ${item.major}` : ""}${item.degree ? ` (${item.degree})` : ""}${item.dateRange ? `, ${item.dateRange}` : ""}`,
    item.notes.length ? `      notes: ${joinList(item.notes)}` : ""
  ].filter(Boolean).join("\n")).join("\n");
}

function formatOrganizations(items: RealtimeContext["userProfileContext"]["organizations"]) {
  if (!items.length) return "    none";
  return items.map((item) => [
    `    - ${item.roleTitle || "Role"} at ${item.organizationName || "organization"}${item.dateRange ? ` (${item.dateRange})` : ""}`,
    item.responsibilities.length ? `      responsibilities: ${joinList(item.responsibilities)}` : ""
  ].filter(Boolean).join("\n")).join("\n");
}

function formatInternships(items: RealtimeContext["userProfileContext"]["internships"]) {
  if (!items.length) return "    none";
  return items.map((item) => [
    `    - ${item.roleTitle || "Experience"} at ${item.organizationName || "organization"} (${item.dateRange || item.duration || "date unknown"})`,
    item.responsibilities.length ? `      responsibilities: ${joinList(item.responsibilities)}` : "",
    item.projects.length ? `      projects: ${joinList(item.projects)}` : ""
  ].filter(Boolean).join("\n")).join("\n");
}
