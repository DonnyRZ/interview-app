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
  - summary: ${context.candidateContext.summary || "unknown"}
  - reusableContext: ${context.candidateContext.readyContext || "unknown"}
  - skillsOrCapabilities: ${joinList(context.candidateContext.skills)}
  - relevantBackground: ${joinList(context.candidateContext.relevantExperience)}
  - structuredBackground:
${formatExperiences(context.candidateContext.experiences)}
  - education:
${formatEducation(context.candidateContext.education)}
  - organizations:
${formatOrganizations(context.candidateContext.organizations)}
  - internshipsOrEarlyExperience:
${formatInternships(context.candidateContext.internships)}
  - usefulStrengths: ${joinList(context.candidateContext.strengthsForInterview)}
  - knownRisksOrGaps: ${joinList(context.candidateContext.risks)}

- meetingContext:
  - organizationOrCounterparty: ${context.applicationContext.companyName || "unknown"}
  - sessionTitleOrTopic: ${context.applicationContext.roleTitle || "unknown"}
  - sessionSummary: ${context.applicationContext.jdSummary || "unknown"}
  - keyRequirementsOrCriteria: ${joinList(context.applicationContext.roleRequirements)}
  - responsibilitiesOrScope: ${joinList(context.applicationContext.responsibilities)}
  - optionalConsiderations: ${joinList(context.applicationContext.niceToHave)}
  - preparationThemes: ${joinList(context.applicationContext.interviewPrepThemes)}
  - sessionContext: ${context.applicationContext.applicationContext || "unknown"}

- domainProfile:
  - primaryDomain: ${context.domainProfile.primaryDomain || "unknown"}
  - domainDescription: ${context.domainProfile.nicheDescription || "unknown"}
  - inScopeConcepts: ${joinList(context.domainProfile.inScopeConcepts)}
  - outOfScopeConcepts: ${joinList(context.domainProfile.outOfScopeConcepts)}
  - seedConcepts: ${joinList(context.domainProfile.seedConcepts)}
  - relevanceGuidance: ${context.domainProfile.relevanceGuidance || "unknown"}

- liveSession:
  - legacyStageType: ${context.stageContext.stageType}
  - focusHints: ${joinList(context.stageContext.focus)}`;
}

function joinList(items: string[]) {
  return items.map((item) => item.trim()).filter(Boolean).join(", ") || "none";
}

function formatExperiences(items: RealtimeContext["candidateContext"]["experiences"]) {
  if (!items.length) return "    none";
  return items.map((item) => [
    `    - ${item.roleTitle || "Role"} at ${item.companyName || "organization"} (${item.dateRange || item.duration || "date unknown"})`,
    item.projects.length ? `      projects: ${joinList(item.projects)}` : "",
    item.responsibilities.length ? `      responsibilities: ${joinList(item.responsibilities)}` : "",
    item.impact.length ? `      impact: ${joinList(item.impact)}` : "",
    item.technologies.length ? `      toolsOrMethods: ${joinList(item.technologies)}` : ""
  ].filter(Boolean).join("\n")).join("\n");
}

function formatEducation(items: RealtimeContext["candidateContext"]["education"]) {
  if (!items.length) return "    none";
  return items.map((item) => [
    `    - ${item.institution || "Institution"}${item.major ? `, ${item.major}` : ""}${item.degree ? ` (${item.degree})` : ""}${item.dateRange ? `, ${item.dateRange}` : ""}`,
    item.notes.length ? `      notes: ${joinList(item.notes)}` : ""
  ].filter(Boolean).join("\n")).join("\n");
}

function formatOrganizations(items: RealtimeContext["candidateContext"]["organizations"]) {
  if (!items.length) return "    none";
  return items.map((item) => [
    `    - ${item.roleTitle || "Role"} at ${item.organizationName || "organization"}${item.dateRange ? ` (${item.dateRange})` : ""}`,
    item.responsibilities.length ? `      responsibilities: ${joinList(item.responsibilities)}` : ""
  ].filter(Boolean).join("\n")).join("\n");
}

function formatInternships(items: RealtimeContext["candidateContext"]["internships"]) {
  if (!items.length) return "    none";
  return items.map((item) => [
    `    - ${item.roleTitle || "Experience"} at ${item.companyName || "organization"} (${item.dateRange || item.duration || "date unknown"})`,
    item.responsibilities.length ? `      responsibilities: ${joinList(item.responsibilities)}` : "",
    item.projects.length ? `      projects: ${joinList(item.projects)}` : ""
  ].filter(Boolean).join("\n")).join("\n");
}

