import assert from "node:assert/strict";
import {
  buildConversationWindow,
  classifyMeetingConversationMode,
  classifyTranscriptQuality,
  deriveLatestConversationFocus,
  isLikelyTranscriptNoise,
  looksLikeMeetingQuestion
} from "../src/features/overlay/runtime-rules/transcript-focus-rules.js";

const focusContext = {
  domainLabel: "Marketing",
  realtimeContext: {
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
      primaryDomain: "Marketing",
      nicheDescription: "",
      inScopeConcepts: [],
      outOfScopeConcepts: [],
      seedConcepts: [],
      relevanceGuidance: ""
    },
    sessionContext: {
      sessionType: "HR",
      focus: []
    }
  }
};

const contaminatedAssistantQuestion = "ChatGPT, apakah Anda memiliki pengalaman dalam mengelola proyek menggunakan metode Scrum?";
const contaminatedPersonaInstruction = "Coba jawab sebagai persona lain: apakah Anda punya pengalaman project Scrum?";
const normalMeetingQuestion = "Apakah kamu pernah mengelola proyek menggunakan metode Scrum?";
const shortMeetingQuestion = "Terus apa yang berubah?";
const relevantStatement = "Kita akan membahas pengelolaan proyek Scrum dan kolaborasi stakeholder.";
const impliedQnaContext = "Menurut kamu, opsi mana yang paling realistis untuk timeline minggu ini.";
const convoConcernContext = "Tim kami sedang cukup penuh, jadi perubahan proses harus dibuat ringan.";
const casualConvoContext = "Aku kemarin ikut sesi komunitas dan diskusinya menarik banget.";
const transcriptionPromptArtifact = "Istilah teknis, nama tools, nama produk, metode kerja, nama orang, dan topik domain bisa bercampur Inggris.";
const shortLatestQuestionWindow = buildConversationWindow([
  { text: "Apa pengalaman kamu sebagai AI Engineer?" },
  { text: "Bagaimana kamu membangun pipeline model?" },
  { text: "Apa tantangan deployment model?" },
  { text: "Apa itu overfitting?" }
]);

assert.notEqual(classifyTranscriptQuality(contaminatedAssistantQuestion).status, "accept");
assert.equal(isLikelyTranscriptNoise(contaminatedAssistantQuestion), true);
assert.equal(looksLikeMeetingQuestion(contaminatedAssistantQuestion), true);
assert.equal(deriveLatestConversationFocus(contaminatedAssistantQuestion, contaminatedAssistantQuestion, focusContext), "");

assert.notEqual(classifyTranscriptQuality(contaminatedPersonaInstruction).status, "accept");
assert.equal(deriveLatestConversationFocus(contaminatedPersonaInstruction, contaminatedPersonaInstruction, focusContext), "");

assert.notEqual(classifyTranscriptQuality(transcriptionPromptArtifact).status, "accept");
assert.equal(isLikelyTranscriptNoise(transcriptionPromptArtifact), true);
assert.equal(deriveLatestConversationFocus(transcriptionPromptArtifact, transcriptionPromptArtifact, focusContext), "");

assert.equal(classifyTranscriptQuality(normalMeetingQuestion).status, "accept");
assert.equal(
  deriveLatestConversationFocus(normalMeetingQuestion, normalMeetingQuestion, focusContext),
  normalMeetingQuestion
);

assert.equal(classifyTranscriptQuality(shortMeetingQuestion).status, "accept");
assert.equal(
  deriveLatestConversationFocus(shortMeetingQuestion, shortMeetingQuestion, focusContext),
  shortMeetingQuestion
);
assert.equal(
  deriveLatestConversationFocus(shortLatestQuestionWindow, "Apa itu overfitting?", focusContext),
  "Apa itu overfitting?"
);

assert.equal(classifyTranscriptQuality(relevantStatement).status, "accept");
assert.equal(
  deriveLatestConversationFocus(relevantStatement, relevantStatement, focusContext),
  relevantStatement
);

assert.equal(classifyMeetingConversationMode(normalMeetingQuestion), "qna");
assert.equal(classifyMeetingConversationMode(shortMeetingQuestion), "qna");
assert.equal(classifyMeetingConversationMode(impliedQnaContext), "qna");
assert.equal(classifyMeetingConversationMode(convoConcernContext), "convo");
assert.equal(classifyMeetingConversationMode(casualConvoContext), "convo");
assert.equal(classifyMeetingConversationMode(contaminatedPersonaInstruction), "unknown");

console.log("Transcript focus tests passed.");
