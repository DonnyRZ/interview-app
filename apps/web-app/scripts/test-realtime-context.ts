import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  extractRealtimeResponseText,
  formatRealtimeResponsePoints,
  getRealtimeRateLimitState,
  getRealtimeResponseDoneState,
  RealtimeConversationState
} from "@interview-app/shared";
import {
  canClaimRealtimeResponseId,
  hasRealtimeResponseIdConflict,
  isRealtimeResponseOwnedBy
} from "../src/features/realtime/realtime-response-ownership.js";

const waitingFocusText = "Belum ada konteks percakapan tertangkap.";
const state = new RealtimeConversationState({ waitingFocusText, getContext: () => ({}) });
const oldCapturedAt = new Date(Date.now() - 10 * 60_000).toISOString();

const accepted = state.registerCompletedTranscript({
  itemId: "turn-1",
  transcriptText: "Apakah kamu pernah mengelola proyek menggunakan metode Scrum?",
  capturedAt: oldCapturedAt
});
assert.ok(accepted.turn);
assert.ok(state.getStableConversationSnapshot(), "help actions retain the last accepted stable context without a hard TTL");
assert.equal(state.getKeywordConversationSnapshot({ maxAgeMs: 120_000 }), null, "keyword discovery may use bounded recency");

state.registerCompletedTranscript({
  itemId: "turn-2",
  previousItemId: "turn-1",
  transcriptText: "Latest conversation focus. Jawab Pertanyaan. Tanggapi. Runtime keyword chips.",
  capturedAt: new Date().toISOString()
});
assert.equal(state.getStableConversationSnapshot()?.focus, accepted.update?.stable?.focus, "rejected UI contamination cannot replace stable context");

const focusState = new RealtimeConversationState({ waitingFocusText, getContext: () => ({}) });
[
  "Apa pengalaman kamu sebagai AI Engineer?",
  "Bagaimana kamu membangun pipeline model?",
  "Apa tantangan deployment model?",
  "Apa itu overfitting?"
].forEach((transcriptText, index) => {
  focusState.registerCompletedTranscript({
    itemId: `focus-turn-${index + 1}`,
    previousItemId: index > 0 ? `focus-turn-${index}` : undefined,
    transcriptText,
    capturedAt: new Date(Date.now() + index).toISOString()
  });
});
assert.equal(
  focusState.getStableConversationSnapshot()?.focus,
  "Apa itu overfitting?",
  "latest conversation focus must show the latest accepted question, not previous question history"
);

const hookPath = fileURLToPath(new URL("../src/features/realtime/use-realtime-transcription.ts", import.meta.url));
const hookSource = await readFile(hookPath, "utf8");
assert.match(hookSource, /RealtimeConversationState/);
assert.doesNotMatch(hookSource, /conversationFreshnessMs|hasRecentAudioSignal|audio\.hasSignal\(\)/);
assert.doesNotMatch(hookSource, /scheduleMock|buildMock|extractMock|VITE_WEB_APP_REALTIME_MODE/);
assert.match(hookSource, /activeHelpRealtimeResponseRef/, "help responses must have a separate realtime owner");
assert.match(hookSource, /activeKeywordResponseRef/, "keyword responses must have a separate realtime owner");
assert.doesNotMatch(hookSource, /activeResponseRef/, "web realtime must not share one active response owner for help and keywords");
assert.match(hookSource, /responseSlotStateRef/, "web realtime must serialize response.create calls through one response slot");
assert.match(hookSource, /queuedHelpRequestRef/, "help actions must queue while a keyword/help response is active");
assert.match(hookSource, /!isResponseSlotIdle\(\) \|\| queuedHelpRequestRef\.current/, "keyword refresh must not compete with queued user help");
assert.match(hookSource, /isActiveResponseInProgressError/, "active-response races must be retried as queue waits, not surfaced as final help errors");
assert.match(hookSource, /getRealtimeResponseDoneState/, "response.done must be interpreted by terminal status");
assert.match(hookSource, /doneState\.status !== "completed"/, "non-completed response.done events must not be treated as successful empty answers");
assert.match(hookSource, /nonCompletedRetryCount/, "cancelled or incomplete responses need a retry budget separate from empty completed responses");
assert.match(hookSource, /realtimeSettleUntilRef/, "help requests must respect a short settle window after speech or transcript transitions");
assert.match(hookSource, /getRealtimeRateLimitState/, "rate limit errors must be parsed instead of displayed raw");
assert.match(hookSource, /realtimeRateLimitUntilRef/, "rate limit cooldown must gate help and keyword requests");
assert.match(hookSource, /rateLimitRetryCount/, "rate-limited help must retry with a bounded retry budget");
assert.match(hookSource, /const realtimeRateLimitMaxRetries = 2;/, "rate-limited help retries must stay conservative for TPM protection");
assert.match(hookSource, /getRealtimeRateLimitState\(doneState\.errorMessage\)/, "rate-limited response.done failures must retry instead of displaying raw errors");
assert.match(hookSource, /compactRealtimePromptPayload/, "runtime action prompts must be compacted before response.create");
assert.match(hookSource, /buildKeywordSourceText/, "web keyword requests must use the same transcript-first source as desktop");
assert.match(hookSource, /buildKeywordRequestFingerprint/, "web keyword requests must fingerprint context before sending");
assert.match(hookSource, /keywordLastRequestedKeyRef/, "web keyword requests must dedupe against the last sent keyword context");
assert.match(hookSource, /pendingKeywordRequestRef\.current\?\.requestKey/, "web keyword requests must dedupe against pending keyword context");
const rateLimitSource = hookSource.slice(hookSource.indexOf("const handleRealtimeRateLimit"), hookSource.indexOf("function isCurrentHelpRequest"));
assert.match(rateLimitSource, /pendingKeywordRequestRef\.current = null;/, "rate-limited keyword work must be dropped instead of retried");
assert.doesNotMatch(rateLimitSource, /schedulePendingKeywordFlush/, "rate-limited keyword work must not schedule another keyword flush");
const requestHelpSource = hookSource.slice(hookSource.indexOf("const requestHelp"), hookSource.indexOf("const stop"));
assert.match(requestHelpSource, /queueHelpRequest\(queuedRequest\)/, "help button requests must enter the realtime queue");
assert.doesNotMatch(requestHelpSource, /sendResponseRequest\(payload,\s*500\)/, "help button must not bypass the response slot");

const audioPath = fileURLToPath(new URL("../src/features/audio/system-audio-capture.ts", import.meta.url));
const audioSource = await readFile(audioPath, "utf8");
assert.match(audioSource, /maxPrebufferChunks = 20/);
assert.match(audioSource, /audioSenderSignalThreshold = 0\.015/, "web audio sender should use the conservative desktop-style signal threshold");
assert.match(audioSource, /audioSendTailChunks = 8/, "web audio sender must keep a short tail so server VAD can close the turn");
assert.match(audioSource, /emitPcm16WithSilencePolicy/, "web audio must avoid sending endless silent PCM to realtime");
assert.match(audioSource, /createPcm16SenderState/, "web audio subscriptions need isolated sender state");
assert.match(audioSource, /sentAudioSeconds/, "web audio metrics must distinguish captured audio from realtime-sent audio");
assert.match(audioSource, /suppressedSilentSeconds/, "web audio metrics must expose suppressed silent audio");
assert.match(audioSource, /observeAudioCaptureMetrics/, "web audio must expose dev-only capture metrics");
assert.match(audioSource, /\[orviko:web-audio-metrics\]/, "web audio metrics must be easy to identify in dev console");
assert.doesNotMatch(audioSource, /level\s*[>=]=?\s*0\.025/);
assert.doesNotMatch(audioSource, /return\s+;\s*\/\/\s*drop pcm/i, "audio instrumentation must not drop PCM chunks");
assert.doesNotMatch(audioSource, /for \(const callback of pcm16Callbacks\) callback\(chunk\)/, "web audio must not broadcast every raw PCM chunk unconditionally");

assert.equal(hasRealtimeResponseIdConflict(
  { requestId: 7, responseId: "resp_help" },
  { requestId: 3, responseId: "resp_keyword" },
  "resp_keyword"
), true, "keyword response id must not be owned by help");
assert.equal(hasRealtimeResponseIdConflict(
  { requestId: 7, responseId: "resp_help" },
  { requestId: 3, responseId: "resp_keyword" },
  "resp_help"
), false, "help response id remains owned by help");
assert.equal(canClaimRealtimeResponseId(
  { requestId: 7 },
  { requestId: 3, responseId: "resp_keyword" },
  "resp_keyword",
  true
), false, "help must not claim an active keyword response");
assert.equal(canClaimRealtimeResponseId(
  { requestId: 7 },
  null,
  "resp_help",
  true
), true, "help may claim an unowned help response");
assert.equal(isRealtimeResponseOwnedBy(
  { requestId: 7, responseId: "resp_help" },
  "resp_help",
  (requestId) => requestId === 7
), true);
assert.equal(isRealtimeResponseOwnedBy(
  { requestId: 6, responseId: "resp_help" },
  "resp_help",
  (requestId) => requestId === 7
), false, "stale help request must not receive realtime output");

const completedResponseDone = {
  type: "response.done",
  response: {
    id: "resp_completed",
    status: "completed",
    output: [{ content: [{ type: "text", text: "- Jawaban valid" }] }]
  }
};
assert.equal(getRealtimeResponseDoneState(completedResponseDone).status, "completed");
assert.equal(extractRealtimeResponseText(completedResponseDone), "- Jawaban valid");
assert.deepEqual(formatRealtimeResponsePoints(extractRealtimeResponseText(completedResponseDone), {
  action: "answer_qna",
  conversationMode: "qna"
}), ["Jawaban valid"]);

const cancelledTurnDetectedResponseDone = {
  type: "response.done",
  response: {
    id: "resp_cancelled",
    status: "cancelled",
    status_details: { type: "cancelled", reason: "turn_detected" },
    output: []
  }
};
assert.equal(getRealtimeResponseDoneState(cancelledTurnDetectedResponseDone).status, "cancelled");
assert.equal(getRealtimeResponseDoneState(cancelledTurnDetectedResponseDone).reason, "turn_detected");
assert.equal(extractRealtimeResponseText(cancelledTurnDetectedResponseDone), "");

const failedResponseDone = {
  type: "response.done",
  response: {
    id: "resp_failed",
    status: "failed",
    status_details: { type: "failed", error: { code: "server_error", message: "temporary failure" } },
    output: []
  }
};
assert.equal(getRealtimeResponseDoneState(failedResponseDone).status, "failed");
assert.equal(getRealtimeResponseDoneState(failedResponseDone).errorCode, "server_error");
assert.equal(getRealtimeResponseDoneState(failedResponseDone).errorMessage, "temporary failure");

const failedRateLimitResponseDone = {
  type: "response.done",
  response: {
    id: "resp_rate_limited",
    status: "failed",
    status_details: {
      type: "failed",
      error: {
        code: "rate_limit_exceeded",
        message: "Rate limit reached for gpt-realtime-mini on tokens per min (TPM). Please try again in 8.632s."
      }
    },
    output: []
  }
};
assert.equal(getRealtimeResponseDoneState(failedRateLimitResponseDone).status, "failed");
assert.deepEqual(getRealtimeRateLimitState(getRealtimeResponseDoneState(failedRateLimitResponseDone).errorMessage), {
  rateLimited: true,
  retryAfterMs: 8632
});

const incompleteWithPartialTextResponseDone = {
  type: "response.done",
  response: {
    id: "resp_incomplete",
    status: "incomplete",
    status_details: { type: "incomplete", reason: "max_output_tokens" },
    output: [{ content: [{ type: "text", text: "- Jawaban parsial" }] }]
  }
};
assert.equal(getRealtimeResponseDoneState(incompleteWithPartialTextResponseDone).status, "incomplete");
assert.equal(getRealtimeResponseDoneState(incompleteWithPartialTextResponseDone).reason, "max_output_tokens");
assert.equal(extractRealtimeResponseText(incompleteWithPartialTextResponseDone), "- Jawaban parsial");

const rateLimitErrorMessage = "Rate limit reached for gpt-realtime-mini on tokens per min (TPM). Please try again in 6.949s.";
assert.deepEqual(getRealtimeRateLimitState(rateLimitErrorMessage), {
  rateLimited: true,
  retryAfterMs: 6949
});
assert.deepEqual(getRealtimeRateLimitState("Please try again in 298ms. Rate limit reached."), {
  rateLimited: true,
  retryAfterMs: 298
});
assert.equal(getRealtimeRateLimitState("Realtime API error.").rateLimited, false);

console.log("Web realtime parity tests passed.");
