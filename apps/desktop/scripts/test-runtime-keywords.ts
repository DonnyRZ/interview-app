import assert from "node:assert/strict";
import { surfaceRealtimeKeywordsResultSchema } from "../../api/src/modules/ai/action-schemas.js";
import { buildPrompt } from "../../api/src/modules/ai/prompt-builder.js";
import { surfaceRealtimeKeywordsSpec } from "../../api/src/modules/ai/actions/surface-realtime-keywords.js";
import { buildRealtimeInterviewSessionInstructions } from "../../api/src/modules/ai/actions/realtime-interview-session.js";
import { buildRealtimeActionPrompt } from "../src/features/overlay/runtime-rules/realtime-action-prompt.js";

const realtimeContext = {
    candidateContext: {
      summary: "",
      readyContext: "",
      skills: [],
      relevantExperience: [],
      experiences: [],
      education: [],
      organizations: [],
      internships: [],
      strengthsForInterview: [],
      risks: []
    },
    applicationContext: {
      companyName: "",
      roleTitle: "",
      jdSummary: "",
      roleRequirements: [],
      responsibilities: [],
      niceToHave: [],
      interviewPrepThemes: [],
      applicationContext: ""
    },
    domainProfile: {
      primaryDomain: "",
      nicheDescription: "",
      inScopeConcepts: [],
      outOfScopeConcepts: [],
      seedConcepts: [],
      relevanceGuidance: ""
    },
    stageContext: {
      stageType: "TECHNICAL",
      focus: []
    }
  };

const prompt = buildPrompt(surfaceRealtimeKeywordsSpec, {
  transcriptSegment: "Interviewer menyebut beberapa term penting dalam percakapan terbaru.",
  realtimeContext
});

const promptText = `${prompt.systemInstructions}\n${prompt.assembledPrompt}`;
assert(promptText.includes("transcript-first"));
assert(promptText.includes("bukan sebagai sumber keyword baru"));
assert(promptText.includes("Jangan hardcode"));
assert(!promptText.includes("TikTok"));
assert(!promptText.includes("CAC"));
assert(!promptText.includes("ROAS"));

const parsed = surfaceRealtimeKeywordsResultSchema.parse({
  status: "success",
  result: {
    shouldExpandOverlay: true,
    keywords: [
      { term: "term one", whyRelevant: "", explanationHint: "" },
      { term: "term two", whyRelevant: "", explanationHint: "" },
      { term: "term three", whyRelevant: "", explanationHint: "" }
    ]
  },
  warnings: [],
  missingInputs: [],
  confidence: "medium",
  evidence: []
});
assert.equal(parsed.result.keywords.length, 3);

const realtimePrompt = buildRealtimeActionPrompt({
  action: "keyword",
  triggerText: "selected keyword",
  recentTranscript: "Interviewer menyebut selected keyword dalam percakapan terbaru.",
  latestQuestion: "Interviewer menyebut selected keyword dalam percakapan terbaru."
});
assert(realtimePrompt.includes("TRIGGER: EXPLAIN_KEYWORD"));
assert(realtimePrompt.includes("Input user/keyword:\nselected keyword"));

const surfacePrompt = buildRealtimeActionPrompt({
  action: "surface_keywords",
  recentTranscript: "Interviewer menyebut selected keyword dalam percakapan terbaru.",
  latestQuestion: "Interviewer menyebut selected keyword dalam percakapan terbaru."
});
assert(surfacePrompt.includes("TRIGGER: SURFACE_KEYWORDS"));
assert(surfacePrompt.includes("BEGIN_RUNTIME_DATA"));
assert(surfacePrompt.includes("Conversation window terbaru:"));

const realtimeInstructions = buildRealtimeInterviewSessionInstructions(realtimeContext);
assert(realtimeInstructions.includes("SURFACE_KEYWORDS"));
assert(realtimeInstructions.includes("KEYWORDS: term one | term two | term three"));
assert(realtimeInstructions.includes("transcript-first"));
assert(!realtimeInstructions.includes("TikTok"));
assert(!realtimeInstructions.includes("CAC"));
assert(!realtimeInstructions.includes("ROAS"));

console.log("Runtime keyword tests passed.");
