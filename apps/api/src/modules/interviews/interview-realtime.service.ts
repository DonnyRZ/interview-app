import type { RealtimeContext } from "@interview-app/shared";
import { env } from "../../env.js";
import { createOpenAiRealtimeClientSecret } from "../ai/openai.client.js";

export async function createInterviewRealtimeClientSecret(realtimeContext: RealtimeContext) {
  if (env.OPENAI_REALTIME_MODEL !== "gpt-realtime-mini") {
    throw new Error("Live interview runtime only supports gpt-realtime-mini.");
  }

  return createOpenAiRealtimeClientSecret(buildRealtimeInstructions(realtimeContext));
}

function buildRealtimeInstructions(context: RealtimeContext) {
  return [
    "You are the live interview copilot for a candidate during an active interview.",
    "Runtime behavior:",
    "- Listen to interviewer audio and keep context, but do not answer automatically.",
    "- Only generate help when the user sends an explicit trigger: BANTU_JAWAB, BANTU_FOLLOWUP, JELASKAN_MAKSUDNYA, EXPLAIN_KEYWORD, or ASK.",
    "- Keep responses concise, practical, and ready to say aloud. Use Indonesian unless the user's trigger is clearly English.",
    "- Ground every suggestion in the candidate profile, role, JD, and domain profile below.",
    "- Surface runtime keywords broadly when relevant to the role domain, not only the narrowest niche intersection.",
    "- If the interviewer topic is clearly out of scope, say that no relevant help is available instead of forcing a keyword.",
    "",
    "Action formats:",
    "- BANTU_JAWAB: draft a strong answer in 3-5 bullets.",
    "- BANTU_FOLLOWUP: suggest 2-3 thoughtful follow-up questions.",
    "- JELASKAN_MAKSUDNYA: explain what the interviewer likely wants to evaluate and how to approach the answer.",
    "- EXPLAIN_KEYWORD: explain the keyword and how to use it in this interview context.",
    "- ASK: answer the user's custom request using the same interview context.",
    "",
    "Candidate summary:",
    context.candidateContext.summary,
    "",
    "Candidate ready context:",
    context.candidateContext.readyContext,
    "",
    `Candidate skills: ${joinList(context.candidateContext.skills)}`,
    `Relevant experience: ${joinList(context.candidateContext.relevantExperience)}`,
    `Interview strengths: ${joinList(context.candidateContext.strengthsForInterview)}`,
    `Known risks: ${joinList(context.candidateContext.risks)}`,
    "",
    "Application:",
    `${context.applicationContext.companyName} - ${context.applicationContext.roleTitle}`,
    context.applicationContext.jdSummary,
    context.applicationContext.applicationContext,
    `Role requirements: ${joinList(context.applicationContext.roleRequirements)}`,
    `Interview prep themes: ${joinList(context.applicationContext.interviewPrepThemes)}`,
    "",
    "Domain profile:",
    `Primary domain: ${context.domainProfile.primaryDomain}`,
    `Niche: ${context.domainProfile.nicheDescription}`,
    `In-scope concepts: ${joinList(context.domainProfile.inScopeConcepts)}`,
    `Out-of-scope concepts: ${joinList(context.domainProfile.outOfScopeConcepts)}`,
    `Seed concepts: ${joinList(context.domainProfile.seedConcepts)}`,
    `Relevance guidance: ${context.domainProfile.relevanceGuidance}`,
    "",
    `Interview stage: ${context.stageContext.stageType}`,
    `Stage focus: ${joinList(context.stageContext.focus)}`
  ].join("\n");
}

function joinList(items: string[]) {
  return items.map((item) => item.trim()).filter(Boolean).join("; ") || "-";
}
