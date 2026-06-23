import assert from "node:assert/strict";
import { surfaceRealtimeKeywordsResultSchema } from "../../api/src/modules/ai/action-schemas.js";
import { buildPrompt } from "../../api/src/modules/ai/prompt-builder.js";
import { surfaceRealtimeKeywordsSpec } from "../../api/src/modules/ai/actions/keywords/surface-meeting-keywords.js";
import { generateMeetingExplanationSpec } from "../../api/src/modules/ai/actions/explanation/generate-meeting-explanation.js";
import { generateMeetingFollowupSpec } from "../../api/src/modules/ai/actions/followup/generate-meeting-followup.js";
import { buildRealtimeMeetingSessionInstructions } from "../../api/src/modules/ai/actions/realtime/realtime-meeting-session.js";
import { buildRealtimeActionPrompt } from "../src/features/overlay/runtime-rules/realtime-action-prompt.js";
import { isConversationHelpActionName } from "../src/features/overlay/runtime-rules/realtime-action-types.js";
import { formatRealtimeResponsePoints } from "../src/features/overlay/runtime-rules/overlay-response-copy.js";
import {
  getForcedConversationMode,
  isRealtimeActionName
} from "../electron/realtime-action-contract.js";

const realtimeContext = {
    userProfileContext: {
      summary: "",
      readyContext: "",
      skills: [],
      relevantExperience: [],
      experiences: [],
      education: [],
      organizations: [],
      internships: [],
      usefulStrengths: [],
      risks: []
    },
    meetingContext: {
      contextName: "",
      meetingTopic: "",
      meetingSummary: "",
      keyCriteria: [],
      responsibilities: [],
      niceToHave: [],
      preparationThemes: [],
      meetingContext: ""
    },
    domainProfile: {
      primaryDomain: "",
      nicheDescription: "",
      inScopeConcepts: [],
      outOfScopeConcepts: [],
      seedConcepts: [],
      relevanceGuidance: ""
    },
    sessionContext: {
      sessionType: "TECHNICAL",
      focus: []
    }
  };

const prompt = buildPrompt(surfaceRealtimeKeywordsSpec, {
  transcriptSegment: "Lawan bicara menyebut beberapa term penting dalam percakapan terbaru.",
  realtimeContext
});

const promptText = `${prompt.systemInstructions}\n${prompt.assembledPrompt}`;
assert(promptText.includes("transcript-first"));
assert(promptText.includes("bukan sebagai sumber keyword baru"));
assert(promptText.includes("Jangan hardcode"));
assert(!promptText.includes("TikTok"));
assert(!promptText.includes("CAC"));
assert(!promptText.includes("ROAS"));
assert(!promptText.includes("kandidat saat interview"));
const realtimeSessionInstructions = buildRealtimeMeetingSessionInstructions(realtimeContext);
assert(realtimeSessionInstructions.includes("the first character of the final response must be '-'"));
assert(realtimeSessionInstructions.includes("do not start with acknowledgements or meta/persona framing"));
assert(realtimeSessionInstructions.includes("do not describe the answer as the user's experience or as an AI Engineer template"));

assert.deepEqual(
  formatRealtimeResponsePoints("- Berikut adalah penjelasan mengenai tahapan yang disebutkan:\n- Fokus pada stabilisasi harga pangan.", {
    action: "answer_qna",
    conversationMode: "qna"
  }),
  ["Fokus pada stabilisasi harga pangan."]
);
assert.deepEqual(
  formatRealtimeResponsePoints("JAWAB_PERTANYAAN: Fokus pada risiko utama dan data yang perlu dicek.", {
    action: "answer_qna",
    conversationMode: "qna"
  }),
  ["Fokus pada risiko utama dan data yang perlu dicek."]
);
assert.deepEqual(
  formatRealtimeResponsePoints("Berikut adalah jawaban singkat: fokus pada risiko utama dulu.", {
    action: "answer_qna",
    conversationMode: "qna"
  }),
  ["Fokus pada risiko utama dulu."]
);
assert.deepEqual(
  formatRealtimeResponsePoints("Tentu. Ini pengalaman saya sebagai AI Engineer: saya pernah membangun model klasifikasi dan memonitor performanya setelah deployment.", {
    action: "answer_qna",
    conversationMode: "qna"
  }),
  ["Saya pernah membangun model klasifikasi dan memonitor performanya setelah deployment."]
);
assert.deepEqual(
  formatRealtimeResponsePoints("Sebagai AI assistant: saya akan fokus pada metrik performa setelah deployment.", {
    action: "answer_qna",
    conversationMode: "qna"
  }),
  ["Saya akan fokus pada metrik performa setelah deployment."]
);
assert.deepEqual(
  formatRealtimeResponsePoints("- Mungkin kita bisa mulai dari concern yang paling berdampak.", {
    action: "answer_convo",
    conversationMode: "convo"
  }),
  ["Kita bisa mulai dari concern yang paling berdampak."]
);

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
  recentTranscript: "Lawan bicara menyebut selected keyword dalam percakapan terbaru.",
  latestQuestion: "Lawan bicara menyebut selected keyword dalam percakapan terbaru.",
  conversationMode: "convo"
});
assert(realtimePrompt.includes("TRIGGER: EXPLAIN_KEYWORD"));
assert(realtimePrompt.includes("Conversation mode hint:\nconvo"));
assert(realtimePrompt.includes("Input user/keyword:\nselected keyword"));

const qnaAnswerPrompt = buildRealtimeActionPrompt({
  action: "answer_qna",
  recentTranscript: "Ada pertanyaan yang perlu dijawab user.",
  latestQuestion: "Ada pertanyaan yang perlu dijawab user.",
  conversationMode: "qna"
});
assert(qnaAnswerPrompt.includes("TRIGGER: JAWAB_PERTANYAAN"));
assert(qnaAnswerPrompt.includes("Conversation mode hint:\nqna"));

const convoAnswerPrompt = buildRealtimeActionPrompt({
  action: "answer_convo",
  recentTranscript: "Ada statement meeting yang perlu ditanggapi user.",
  latestQuestion: "Ada statement meeting yang perlu ditanggapi user.",
  conversationMode: "convo"
});
assert(convoAnswerPrompt.includes("TRIGGER: TANGGAPI"));
assert(convoAnswerPrompt.includes("Conversation mode hint:\nconvo"));

const explanationSubjectSentinel = "EXPLANATION_SUBJECT_SENTINEL_7F3A";
const explainTextPrompt = buildRealtimeActionPrompt({
  action: "explain_text",
  triggerText: explanationSubjectSentinel,
  recentTranscript: "Konteks percakapan netral.",
  latestQuestion: "Fokus percakapan netral."
});
assert(explainTextPrompt.includes("TRIGGER: JELASKAN_MAKSUDNYA"));
assert(explainTextPrompt.includes("EXPLANATION_SOURCE: USER_TEXT"));
assert(explainTextPrompt.includes(`Explanation subject from user:\n${explanationSubjectSentinel}`));
assert(!explainTextPrompt.includes("Conversation mode hint:"));
assert(!explainTextPrompt.includes("TRIGGER: ASK"));

const explainTranscriptPrompt = buildRealtimeActionPrompt({
  action: "explain",
  recentTranscript: "Konteks percakapan netral.",
  latestQuestion: "Fokus percakapan netral."
});
assert(explainTranscriptPrompt.includes("TRIGGER: JELASKAN_MAKSUDNYA"));
assert(explainTranscriptPrompt.includes("EXPLANATION_SOURCE: LATEST_TRANSCRIPT"));
assert(!explainTranscriptPrompt.includes("Explanation subject from user:"));

const surfacePrompt = buildRealtimeActionPrompt({
  action: "surface_keywords",
  recentTranscript: "Lawan bicara menyebut selected keyword dalam percakapan terbaru.",
  latestQuestion: "Lawan bicara menyebut selected keyword dalam percakapan terbaru.",
  conversationMode: "convo"
});
assert(surfacePrompt.includes("TRIGGER: SURFACE_KEYWORDS"));
assert(surfacePrompt.includes("BEGIN_RUNTIME_DATA"));
assert(surfacePrompt.includes("Conversation window terbaru:"));

const realtimeInstructions = buildRealtimeMeetingSessionInstructions(realtimeContext);
assert(realtimeInstructions.includes("SURFACE_KEYWORDS"));
assert(realtimeInstructions.includes("JAWAB_PERTANYAAN"));
assert(realtimeInstructions.includes("TANGGAPI"));
assert(realtimeInstructions.includes("must not be overridden by inferred intent"));
assert(realtimeInstructions.indexOf("Explicit answer trigger routing") < realtimeInstructions.indexOf("Legacy answer action routing"));
assert(realtimeInstructions.includes("For legacy answer action, if runtime conversationMode is qna or convo, treat it as a hint only."));
assert(realtimeInstructions.includes("KEYWORDS: term one | term two | term three"));
assert(realtimeInstructions.includes("transcript-first"));
assert(realtimeInstructions.includes("QnA mode rules"));
assert(realtimeInstructions.includes("Convo mode rules"));
assert(realtimeInstructions.includes("JELASKAN_MAKSUDNYA: follow EXPLANATION_SOURCE"));
assert(realtimeInstructions.includes("For USER_TEXT, do not apply QnA or Convo routing"));
assert(realtimeInstructions.includes("explain the user-provided explanation subject as the primary subject"));
assert(realtimeInstructions.includes("For LATEST_TRANSCRIPT, explain the other speaker's likely meaning"));
assert(!/\bASK\b/.test(realtimeInstructions));
assert(!realtimeInstructions.includes("TikTok"));
assert(!realtimeInstructions.includes("CAC"));
assert(!realtimeInstructions.includes("ROAS"));
assert(!realtimeInstructions.includes("live interview copilot"));
assert(!realtimeInstructions.includes("write as the candidate"));
assert(!/interview|candidate|kandidat|interviewer|CV|JD|BANTU_JAWAB|sales|client|vendor|hiring/i.test(realtimeInstructions));

assert.equal(isRealtimeActionName("answer_qna"), true);
assert.equal(isRealtimeActionName("answer_convo"), true);
assert.equal(isRealtimeActionName("explain_text"), true);
assert.equal(isRealtimeActionName("ask"), false);
assert.equal(isRealtimeActionName("answer_wrong"), false);
assert.equal(isConversationHelpActionName("explain"), true);
assert.equal(isConversationHelpActionName("explain_text"), false);
assert.equal(getForcedConversationMode("answer_qna"), "qna");
assert.equal(getForcedConversationMode("answer_convo"), "convo");
assert.equal(getForcedConversationMode("answer"), undefined);

const followupPrompt = buildPrompt(generateMeetingFollowupSpec, {
  meetingPrompt: "Konteks meeting terbaru.",
  realtimeContext
});
const followupPromptText = `${followupPrompt.systemInstructions}\n${followupPrompt.assembledPrompt}`;
assert(!followupPromptText.includes("JAWAB_PERTANYAAN"));
assert(!followupPromptText.includes("TANGGAPI"));
assert(!followupPromptText.includes("QnA mode rules"));
assert(!followupPromptText.includes("Convo mode rules"));

const explanationPrompt = buildPrompt(generateMeetingExplanationSpec, {
  meetingPrompt: "Konteks meeting terbaru.",
  realtimeContext
});
const explanationPromptText = `${explanationPrompt.systemInstructions}\n${explanationPrompt.assembledPrompt}`;
assert(!explanationPromptText.includes("JAWAB_PERTANYAAN"));
assert(!explanationPromptText.includes("TANGGAPI"));
assert(!explanationPromptText.includes("QnA mode rules"));
assert(!explanationPromptText.includes("Convo mode rules"));

console.log("Runtime keyword tests passed.");
