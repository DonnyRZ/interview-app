import {
  RealtimeConversationState,
  type RealtimeContext,
  type StableConversationSnapshot
} from "@interview-app/shared";
import { MutableRefObject, useRef } from "react";

export type { StableConversationSnapshot } from "@interview-app/shared";

type OverlayContextLike = {
  contextName?: string;
  meetingTopic?: string;
  realtimeContext?: RealtimeContext;
  realtimeStatus?: string;
  domainLabel?: string;
};

type UseOverlayTranscriptStateOptions<TContext extends OverlayContextLike> = {
  contextRef: MutableRefObject<TContext>;
  waitingFocusText: string;
  setLatestFocus: (focus: string) => void;
  setStableConversationVersion: (version: number) => void;
  setKeywordTranscriptVersion: (version: number) => void;
  updateOverlayContext: (patch: Record<string, unknown>) => void;
};

export function useOverlayTranscriptState<TContext extends OverlayContextLike>(options: UseOverlayTranscriptStateOptions<TContext>) {
  const callbacksRef = useRef(options);
  callbacksRef.current = options;
  const latestFocusRef = useRef(options.waitingFocusText);
  const stateRef = useRef<RealtimeConversationState | null>(null);

  if (!stateRef.current) {
    stateRef.current = new RealtimeConversationState({
      waitingFocusText: options.waitingFocusText,
      getContext: () => callbacksRef.current.contextRef.current,
      onUpdate(update) {
        latestFocusRef.current = update.focus;
        callbacksRef.current.setLatestFocus(update.focus);
        callbacksRef.current.setStableConversationVersion(update.stableVersion);
        callbacksRef.current.setKeywordTranscriptVersion(update.keywordVersion);
        callbacksRef.current.updateOverlayContext({ latestQuestion: update.focus });
      }
    });
  }

  const state = stateRef.current;

  function reset() {
    state.reset();
    latestFocusRef.current = callbacksRef.current.waitingFocusText;
  }

  function getFullTranscriptText() {
    return state.getFullTranscriptText()
      || `Meeting untuk ${callbacksRef.current.contextRef.current.contextName || "context"} - ${callbacksRef.current.contextRef.current.meetingTopic || "topic"}. Transcript live belum tertangkap.`;
  }

  return {
    latestFocusRef,
    reset,
    markSpeechStarted: () => state.markSpeechStarted(),
    markSpeechStopped: () => state.markSpeechStopped(),
    clearPendingSpeech: () => state.clearPendingSpeech(),
    isPendingSpeech: () => state.isPendingSpeech(),
    ensureTranscriptOrder: (itemId: string, previousItemId?: string) => state.ensureTranscriptOrder(itemId, previousItemId),
    registerTranscriptEvent: (event: OverlayTranscriptEvent) => state.registerTranscriptEvent(event),
    registerTranscriptDelta: (input: { itemId: string; previousItemId?: string; delta: string; capturedAt: string }) => state.registerTranscriptDelta(input),
    registerCompletedTranscript: (input: { transcriptText: string; itemId?: string; previousItemId?: string; capturedAt: string }) => state.registerCompletedTranscript(input),
    registerTranscriptText: (input: { text: string; itemId?: string; previousItemId?: string; capturedAt: string }) => state.registerTranscriptText(input),
    getRecentTranscriptText: () => state.getRecentTranscriptText(),
    getKeywordConversationSnapshot: (snapshotOptions: { maxAgeMs?: number } = {}) => state.getKeywordConversationSnapshot(snapshotOptions),
    getStableConversationSnapshot: (snapshotOptions: { maxAgeMs?: number; blockPendingSpeech?: boolean } = {}): StableConversationSnapshot | null => state.getStableConversationSnapshot(snapshotOptions),
    getFullTranscriptText
  };
}
