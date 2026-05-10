import type { RealtimeContext } from "@interview-app/shared";

export const interviewContextUsagePolicy = [
  "Pilih sumber konteks secara adaptif sebelum menjawab.",
  "Jika pertanyaan bisa dijawab sebagai pengetahuan umum, teknis, atau proses kerja, jawab langsung tanpa memaksakan CV/JD.",
  "Jika interviewer meminta intro, background, atau pengalaman paling relevan, gunakan CV sebagai sumber utama dan pakai JD hanya untuk memilih relevansi role secara ringan.",
  "Jika interviewer meminta pengalaman, contoh nyata, background, project, kekuatan, atau cerita kandidat, gunakan bukti CV yang paling relevan.",
  "Jika interviewer meminta cerita project, tantangan, kegagalan, atau kasus sulit, jawab dengan company/project/blocker/solusi yang spesifik dari CV; jangan berhenti di proses generik.",
  "Jika interviewer membahas role, ekspektasi kerja, responsibility, requirement, nice-to-have, atau closing question, gunakan JD seperlunya dan kaitkan ke CV hanya jika aman.",
  "Jika interviewer menutup dengan kesempatan bertanya, prioritaskan pertanyaan siap ucap dari JD/responsibility/nice-to-have; kaitkan CV hanya jika ada match yang benar-benar jelas.",
  "Jika konteksnya debat, reaksi, maksud tersirat, atau tekanan percakapan, prioritaskan recentTranscript dan general knowledge yang wajar.",
  "Jangan menyebut company, project, angka, tanggal, pendidikan, organisasi, internship, atau detail JD jika tidak tersedia di context.",
  "Jangan overfit ke contoh use case tertentu; ikuti intent percakapan terbaru."
];

export function formatInterviewContextForPrompt(context: RealtimeContext) {
  return `- candidateContext:
  - summary: ${context.candidateContext.summary || "unknown"}
  - readyContext: ${context.candidateContext.readyContext || "unknown"}
  - skills: ${joinList(context.candidateContext.skills)}
  - relevantExperience: ${joinList(context.candidateContext.relevantExperience)}
  - structuredExperience:
${formatExperiences(context.candidateContext.experiences)}
  - education:
${formatEducation(context.candidateContext.education)}
  - organizations:
${formatOrganizations(context.candidateContext.organizations)}
  - internships:
${formatInternships(context.candidateContext.internships)}
  - strengthsForInterview: ${joinList(context.candidateContext.strengthsForInterview)}
  - risks: ${joinList(context.candidateContext.risks)}

- applicationContext:
  - companyName: ${context.applicationContext.companyName}
  - roleTitle: ${context.applicationContext.roleTitle}
  - jdSummary: ${context.applicationContext.jdSummary || "unknown"}
  - roleRequirements: ${joinList(context.applicationContext.roleRequirements)}
  - responsibilities: ${joinList(context.applicationContext.responsibilities)}
  - niceToHave: ${joinList(context.applicationContext.niceToHave)}
  - interviewPrepThemes: ${joinList(context.applicationContext.interviewPrepThemes)}
  - applicationContext: ${context.applicationContext.applicationContext || "unknown"}

- domainProfile:
  - primaryDomain: ${context.domainProfile.primaryDomain || "unknown"}
  - nicheDescription: ${context.domainProfile.nicheDescription || "unknown"}
  - inScopeConcepts: ${joinList(context.domainProfile.inScopeConcepts)}
  - outOfScopeConcepts: ${joinList(context.domainProfile.outOfScopeConcepts)}
  - seedConcepts: ${joinList(context.domainProfile.seedConcepts)}
  - relevanceGuidance: ${context.domainProfile.relevanceGuidance || "unknown"}

- stageContext:
  - stageType: ${context.stageContext.stageType}
  - focus: ${joinList(context.stageContext.focus)}`;
}

function joinList(items: string[]) {
  return items.map((item) => item.trim()).filter(Boolean).join(", ") || "none";
}

function formatExperiences(items: RealtimeContext["candidateContext"]["experiences"]) {
  if (!items.length) return "    none";
  return items.map((item) => [
    `    - ${item.roleTitle || "Role"} at ${item.companyName || "company"} (${item.dateRange || item.duration || "date unknown"})`,
    item.projects.length ? `      projects: ${joinList(item.projects)}` : "",
    item.responsibilities.length ? `      responsibilities: ${joinList(item.responsibilities)}` : "",
    item.impact.length ? `      impact: ${joinList(item.impact)}` : "",
    item.technologies.length ? `      technologies: ${joinList(item.technologies)}` : ""
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
    `    - ${item.roleTitle || "Internship"} at ${item.companyName || "company"} (${item.dateRange || item.duration || "date unknown"})`,
    item.responsibilities.length ? `      responsibilities: ${joinList(item.responsibilities)}` : "",
    item.projects.length ? `      projects: ${joinList(item.projects)}` : ""
  ].filter(Boolean).join("\n")).join("\n");
}
