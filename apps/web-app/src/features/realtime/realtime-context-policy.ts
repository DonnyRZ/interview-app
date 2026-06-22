export const conversationFreshnessMs = 120_000;
export const transcriptionSignalWindowMs = 2_000;

export function hasRecentAudioSignal(lastSignalAt: number, now = Date.now()) {
  return lastSignalAt > 0 && now - lastSignalAt <= transcriptionSignalWindowMs;
}

export function hasFreshConversation(transcript: string, capturedAt: number, now = Date.now()) {
  return Boolean(transcript.trim())
    && capturedAt > 0
    && now - capturedAt <= conversationFreshnessMs;
}
