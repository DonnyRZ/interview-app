import assert from "node:assert/strict";
import {
  buildRealtimeCancelEvent,
  canClaimRealtimeResponseId,
  hasRealtimeResponseIdConflict,
  isRecoverableRealtimeCancelError,
  isRealtimeResponseOwnedBy
} from "../src/features/overlay/overlay-realtime-state.js";
import { buildRealtimeActionPrompt } from "../src/features/overlay/runtime-rules/realtime-action-prompt.js";
import { formatRealtimeResponsePoints } from "../src/features/overlay/runtime-rules/overlay-response-copy.js";
import {
  classifyMeetingConversationMode,
  classifyTranscriptQuality,
  deriveLatestConversationFocus
} from "../src/features/overlay/runtime-rules/transcript-focus-rules.js";

const qnaMetaOpeners = [
  "Berikut adalah penjelasan mengenai tahapan yang disebutkan:",
  "Berikut penjelasan singkatnya:",
  "Ini adalah jawaban singkat:",
  "Poin-poinnya:",
  "Saya akan menjawab seperti ini:",
  "Jawabannya adalah:",
  "Tentu. Ini pengalaman saya sebagai AI Engineer:",
  "Baik, sebagai AI assistant:",
  "Sebagai AI Engineer template:"
];
const qnaAnswerLines = [
  "Fokus dulu pada risiko utama yang paling dekat dengan keputusan.",
  "Gunakan data internal sebagai dasar, lalu pisahkan asumsi dari fakta.",
  "Mulai dari opsi yang paling aman, baru bahas trade-off-nya.",
  "Kalau datanya belum lengkap, sebutkan data yang perlu dicek.",
  "Kunci keputusan bisa dimulai dari dampak, biaya, dan timing."
];

assert.equal(buildRealtimeCancelEvent(null), null);
assert.equal(buildRealtimeCancelEvent({}), null);
assert.deepEqual(buildRealtimeCancelEvent({ responseId: "resp_123" }), {
  type: "response.cancel",
  response_id: "resp_123"
});
assert.equal(isRecoverableRealtimeCancelError("Cancellation failed: no active response found"), true);
assert.equal(isRecoverableRealtimeCancelError("Realtime API error."), false);
assert.equal(isRealtimeResponseOwnedBy(
  { requestId: 7, responseId: "resp_current" },
  { type: "response.done", response: { id: "resp_current" } },
  (requestId) => requestId === 7
), true);
assert.equal(isRealtimeResponseOwnedBy(
  { requestId: 7, responseId: "resp_current" },
  { type: "response.done", response: { id: "resp_old" } },
  (requestId) => requestId === 7
), false);
assert.equal(isRealtimeResponseOwnedBy(
  { requestId: 6, responseId: "resp_current" },
  { type: "response.done", response: { id: "resp_current" } },
  (requestId) => requestId === 7
), false);
assert.equal(hasRealtimeResponseIdConflict(
  { requestId: 7, responseId: "resp_help" },
  { responseId: "resp_keyword" },
  { type: "response.done", response: { id: "resp_keyword" } }
), true);
assert.equal(hasRealtimeResponseIdConflict(
  { requestId: 7, responseId: "resp_help" },
  { responseId: "resp_keyword" },
  { type: "response.done", response: { id: "resp_help" } }
), false);
assert.equal(canClaimRealtimeResponseId(
  { requestId: 7 },
  { responseId: "resp_keyword" },
  { type: "response.created", response: { id: "resp_keyword" } },
  true
), false);
assert.equal(canClaimRealtimeResponseId(
  { requestId: 7 },
  null,
  { type: "response.created", response: { id: "resp_help" } },
  true
), true);
assert.equal(canClaimRealtimeResponseId(
  {},
  { requestId: 7 },
  { type: "response.created", response: { id: "resp_help" } },
  true
), false);
assert.equal(canClaimRealtimeResponseId(
  {},
  null,
  { type: "response.created", response: { id: "resp_keyword" } },
  false
), false);

for (let iteration = 0; iteration < 50; iteration++) {
  const opener = qnaMetaOpeners[iteration % qnaMetaOpeners.length];
  const answer = qnaAnswerLines[iteration % qnaAnswerLines.length];
  const points = formatRealtimeResponsePoints(`${opener}\n- ${answer}`, {
    action: "answer_qna",
    conversationMode: "qna"
  });

  assert.deepEqual(points, [answer]);
  assert.doesNotMatch(points.join("\n"), /^(?:tentu|baik|berikut|ini adalah|poin(?:-poin)?|saya akan|jawabannya|sebagai|JAWAB_PERTANYAAN)/i);
}

for (let iteration = 0; iteration < 50; iteration++) {
  const answer = qnaAnswerLines[iteration % qnaAnswerLines.length];
  const points = formatRealtimeResponsePoints(`JAWAB_PERTANYAAN: ${answer}`, {
    action: "answer_qna",
    conversationMode: "qna"
  });

  assert.deepEqual(points, [answer]);
}

const convoBadOpeners = [
  "Mungkin kita bisa mulai dari concern yang paling berdampak.",
  "Ada baiknya kita sederhanakan dulu scope-nya.",
  "Langkah berikutnya adalah kita bisa mengunci prioritas.",
  "Hal yang bisa dicoba adalah mulai dari bagian paling ringan.",
  "Kita bisa mengevaluasi apakah scope ini masih realistis."
];

for (let iteration = 0; iteration < 50; iteration++) {
  const points = formatRealtimeResponsePoints(`- ${convoBadOpeners[iteration % convoBadOpeners.length]}`, {
    action: "answer_convo",
    conversationMode: "convo"
  });

  assert.equal(points.length, 1);
  assert.doesNotMatch(points[0] || "", /^(?:Mungkin|Ada baiknya|Langkah|Hal yang bisa dicoba)/i);
  assert.doesNotMatch(points[0] || "", /\bapakah\b/i);
}

const qnaPrompt = buildRealtimeActionPrompt({
  requestId: 1,
  action: "answer_qna",
  latestQuestion: "Menurut kamu opsi mana yang paling aman?",
  recentTranscript: "Menurut kamu opsi mana yang paling aman?",
  conversationMode: "qna"
});
assert.match(qnaPrompt, /TRIGGER: JAWAB_PERTANYAAN/);
assert.match(qnaPrompt, /Conversation mode hint:\nqna/);

const convoPrompt = buildRealtimeActionPrompt({
  requestId: 2,
  action: "answer_convo",
  latestQuestion: "Tim kami lagi cukup penuh minggu ini.",
  recentTranscript: "Tim kami lagi cukup penuh minggu ini.",
  conversationMode: "convo"
});
assert.match(convoPrompt, /TRIGGER: TANGGAPI/);
assert.match(convoPrompt, /Conversation mode hint:\nconvo/);

const focusContext = {
  domainLabel: "General",
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
      primaryDomain: "General",
      nicheDescription: "",
      inScopeConcepts: [],
      outOfScopeConcepts: [],
      seedConcepts: [],
      relevanceGuidance: ""
    },
    sessionContext: {
      sessionType: "OTHER" as const,
      focus: []
    }
  }
};

const transcriptCases = [
  { text: "Menurut kamu opsi mana yang paling realistis minggu ini?", mode: "qna" },
  { text: "Tim kami sedang cukup penuh, jadi scope-nya perlu ringan.", mode: "convo" },
  { text: "Bisa jelaskan trade-off dari pilihan ini?", mode: "qna" },
  { text: "Aku agak khawatir kalau timeline ini terlalu padat.", mode: "convo" }
] as const;

for (let iteration = 0; iteration < 25; iteration++) {
  for (const item of transcriptCases) {
    assert.equal(classifyTranscriptQuality(item.text).status, "accept");
    assert.equal(classifyMeetingConversationMode(item.text), item.mode);
    assert.equal(deriveLatestConversationFocus(item.text, item.text, focusContext), item.text);
  }
}

console.log("Overlay runtime stress tests passed.");
