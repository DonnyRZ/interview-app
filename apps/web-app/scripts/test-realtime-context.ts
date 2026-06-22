import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  conversationFreshnessMs,
  hasFreshConversation,
  hasRecentAudioSignal,
  transcriptionSignalWindowMs
} from "../src/features/realtime/realtime-context-policy.js";

const now = 1_000_000;

assert.equal(hasRecentAudioSignal(0, now), false);
assert.equal(hasRecentAudioSignal(now - transcriptionSignalWindowMs - 1, now), false);
assert.equal(hasRecentAudioSignal(now - transcriptionSignalWindowMs, now), true);

assert.equal(hasFreshConversation("", now, now), false);
assert.equal(hasFreshConversation("Konteks terbaru", now - conversationFreshnessMs - 1, now), false);
assert.equal(hasFreshConversation("Konteks terbaru", now - conversationFreshnessMs, now), true);

const hookPath = fileURLToPath(new URL("../src/features/realtime/use-realtime-transcription.ts", import.meta.url));
const hookSource = await readFile(hookPath, "utf8");
assert.doesNotMatch(hookSource, /scheduleMock|buildMock|extractMock|VITE_WEB_APP_REALTIME_MODE/);

console.log("Web realtime context tests passed.");
