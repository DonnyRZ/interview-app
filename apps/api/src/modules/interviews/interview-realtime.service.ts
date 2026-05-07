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
    "- For BANTU_JAWAB, write as the candidate in first person. Do not give coaching instructions.",
    "- Ground every answer in the candidate profile, role, JD, and domain profile below.",
    "- Surface runtime keywords broadly when relevant to the role domain, not only the narrowest niche intersection.",
    "- If the interviewer topic is clearly out of scope, say that no relevant help is available instead of forcing a keyword.",
    "",
    "Action formats:",
    "- BANTU_JAWAB: produce a ready-to-read first-person answer in 3-5 bullets. Start directly with the answer, not the trigger name. Avoid phrases like jelaskan, tekankan, sampaikan, sebutkan, or kamu bisa.",
    "- BANTU_FOLLOWUP: produce 2-3 follow-up questions ready for the candidate to say aloud. Avoid coaching phrases like tanyakan or minta.",
    "- JELASKAN_MAKSUDNYA: explain the interviewer's intent briefly, then give the strongest answer angle.",
    "- EXPLAIN_KEYWORD: explain the keyword briefly and give one ready-to-use sentence for the interview answer.",
    "- ASK: follow the user's custom request. If they ask for an answer, write a ready-to-read answer; if they ask for meaning, explain briefly.",
    "- Formatting: use one bullet per line. Keep each bullet to one concise sentence. Do not return one long paragraph.",
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
