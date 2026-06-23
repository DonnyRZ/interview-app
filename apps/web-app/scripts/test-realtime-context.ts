import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { RealtimeConversationState } from "@interview-app/shared";

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

const hookPath = fileURLToPath(new URL("../src/features/realtime/use-realtime-transcription.ts", import.meta.url));
const hookSource = await readFile(hookPath, "utf8");
assert.match(hookSource, /RealtimeConversationState/);
assert.doesNotMatch(hookSource, /conversationFreshnessMs|hasRecentAudioSignal|audio\.hasSignal\(\)/);
assert.doesNotMatch(hookSource, /scheduleMock|buildMock|extractMock|VITE_WEB_APP_REALTIME_MODE/);

const audioPath = fileURLToPath(new URL("../src/features/audio/system-audio-capture.ts", import.meta.url));
const audioSource = await readFile(audioPath, "utf8");
assert.match(audioSource, /maxPrebufferChunks = 20/);
assert.doesNotMatch(audioSource, /level\s*[>=]=?\s*0\.025/);

console.log("Web realtime parity tests passed.");
