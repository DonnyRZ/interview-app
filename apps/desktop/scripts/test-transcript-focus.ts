import assert from "node:assert/strict";
import {
  classifyMeetingConversationMode,
  classifyTranscriptQuality,
  deriveLatestConversationFocus,
  isLikelyTranscriptNoise,
  looksLikeInterviewerQuestion
} from "../src/features/overlay/runtime-rules/transcript-focus-rules.js";

const focusContext = {
  domainLabel: "Marketing",
  realtimeContext: {
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
      primaryDomain: "Marketing",
      nicheDescription: "",
      inScopeConcepts: [],
      outOfScopeConcepts: [],
      seedConcepts: [],
      relevanceGuidance: ""
    },
    stageContext: {
      stageType: "HR",
      focus: []
    }
  }
};

const contaminatedAssistantQuestion = "ChatGPT, apakah Anda memiliki pengalaman dalam mengelola proyek menggunakan metode Scrum?";
const contaminatedCandidateInstruction = "Coba jawab sebagai kandidat: apakah Anda punya pengalaman project Scrum?";
const normalInterviewerQuestion = "Apakah kamu pernah mengelola proyek menggunakan metode Scrum?";
const shortInterviewerQuestion = "Terus apa yang berubah?";
const relevantStatement = "Kita akan membahas pengelolaan proyek Scrum dan kolaborasi stakeholder.";
const impliedQnaContext = "Menurut kamu, opsi mana yang paling realistis untuk timeline minggu ini.";
const convoConcernContext = "Tim kami sedang cukup penuh, jadi perubahan proses harus dibuat ringan.";
const casualConvoContext = "Aku kemarin ikut sesi komunitas dan diskusinya menarik banget.";
const transcriptionPromptArtifact = "Istilah teknis, nama tools, nama produk, metode kerja, nama orang, dan topik domain bisa bercampur Inggris.";

assert.notEqual(classifyTranscriptQuality(contaminatedAssistantQuestion).status, "accept");
assert.equal(isLikelyTranscriptNoise(contaminatedAssistantQuestion), true);
assert.equal(looksLikeInterviewerQuestion(contaminatedAssistantQuestion), true);
assert.equal(deriveLatestConversationFocus(contaminatedAssistantQuestion, contaminatedAssistantQuestion, focusContext), "");

assert.notEqual(classifyTranscriptQuality(contaminatedCandidateInstruction).status, "accept");
assert.equal(deriveLatestConversationFocus(contaminatedCandidateInstruction, contaminatedCandidateInstruction, focusContext), "");

assert.notEqual(classifyTranscriptQuality(transcriptionPromptArtifact).status, "accept");
assert.equal(isLikelyTranscriptNoise(transcriptionPromptArtifact), true);
assert.equal(deriveLatestConversationFocus(transcriptionPromptArtifact, transcriptionPromptArtifact, focusContext), "");

assert.equal(classifyTranscriptQuality(normalInterviewerQuestion).status, "accept");
assert.equal(
  deriveLatestConversationFocus(normalInterviewerQuestion, normalInterviewerQuestion, focusContext),
  normalInterviewerQuestion
);

assert.equal(classifyTranscriptQuality(shortInterviewerQuestion).status, "accept");
assert.equal(
  deriveLatestConversationFocus(shortInterviewerQuestion, shortInterviewerQuestion, focusContext),
  shortInterviewerQuestion
);

assert.equal(classifyTranscriptQuality(relevantStatement).status, "accept");
assert.equal(
  deriveLatestConversationFocus(relevantStatement, relevantStatement, focusContext),
  relevantStatement
);

assert.equal(classifyMeetingConversationMode(normalInterviewerQuestion), "qna");
assert.equal(classifyMeetingConversationMode(shortInterviewerQuestion), "qna");
assert.equal(classifyMeetingConversationMode(impliedQnaContext), "qna");
assert.equal(classifyMeetingConversationMode(convoConcernContext), "convo");
assert.equal(classifyMeetingConversationMode(casualConvoContext), "convo");
assert.equal(classifyMeetingConversationMode(contaminatedCandidateInstruction), "unknown");

console.log("Transcript focus tests passed.");
