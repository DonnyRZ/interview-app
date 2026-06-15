import { MutableRefObject, useRef } from "react";
import type { RealtimeContext } from "@interview-app/shared";
import {
  areSameTranscript,
  buildConversationWindow,
  chooseMostCompleteTranscript,
  classifyMeetingConversationMode,
  classifyTranscriptQuality,
  deriveLatestConversationFocus,
  type ConversationMode,
  type TranscriptQualityResult
} from "./runtime-rules/transcript-focus-rules.js";

type OverlayContextLike = {
  contextName?: string;
  meetingTopic?: string;
  realtimeContext?: RealtimeContext;
  realtimeStatus?: string;
  domainLabel?: string;
};

type ConversationTurn = {
  itemId: string;
  previousItemId?: string;
  speaker: "interviewer";
  text: string;
  capturedAt: string;
  sequence: number;
};

export type StableConversationSnapshot = {
  focus: string;
  windowText: string;
  capturedAt: string;
  sourceVersion: number;
  conversationMode: ConversationMode;
};

type RejectedTranscriptMetadata = {
  source: "realtime" | "dev";
  reason: string;
  status: TranscriptQualityResult["status"];
  capturedAt: string;
  sample: string;
};

type UseOverlayTranscriptStateOptions<TContext extends OverlayContextLike> = {
  contextRef: MutableRefObject<TContext>;
  waitingFocusText: string;
  setLatestFocus: (focus: string) => void;
  setStableConversationVersion: (version: number) => void;
  setKeywordTranscriptVersion: (version: number) => void;
  updateOverlayContext: (patch: Record<string, unknown>) => void;
};

export function useOverlayTranscriptState<TContext extends OverlayContextLike>({
  contextRef,
  waitingFocusText,
  setLatestFocus,
  setStableConversationVersion,
  setKeywordTranscriptVersion,
  updateOverlayContext
}: UseOverlayTranscriptStateOptions<TContext>) {
  const recentTranscriptRef = useRef<string[]>([]);
  const conversationTurnsRef = useRef<ConversationTurn[]>([]);
  const transcriptItemsRef = useRef(new Map<string, ConversationTurn>());
  const transcriptOrderRef = useRef<string[]>([]);
  const transcriptDeltaItemsRef = useRef(new Map<string, { text: string; previousItemId?: string; capturedAt: string }>());
  const interimTranscriptRef = useRef<ConversationTurn | null>(null);
  const lastTranscriptEventFingerprintRef = useRef("");
  const transcriptSequenceRef = useRef(0);
  const pendingSpeechRef = useRef(false);
  const currentSpeechStartedAtRef = useRef(0);
  const latestFocusRef = useRef(waitingFocusText);
  const conversationWindowRef = useRef("");
  const lastStableConversationRef = useRef<StableConversationSnapshot | null>(null);
  const lastRejectedTranscriptRef = useRef<RejectedTranscriptMetadata | null>(null);
  const stableConversationSourceVersionRef = useRef(0);
  const keywordTranscriptVersionRef = useRef(0);

  function reset() {
    recentTranscriptRef.current = [];
    conversationTurnsRef.current = [];
    transcriptItemsRef.current = new Map();
    transcriptOrderRef.current = [];
    transcriptDeltaItemsRef.current = new Map();
    interimTranscriptRef.current = null;
    lastTranscriptEventFingerprintRef.current = "";
    transcriptSequenceRef.current = 0;
    pendingSpeechRef.current = false;
    currentSpeechStartedAtRef.current = 0;
    latestFocusRef.current = waitingFocusText;
    conversationWindowRef.current = "";
    lastStableConversationRef.current = null;
    lastRejectedTranscriptRef.current = null;
    stableConversationSourceVersionRef.current = 0;
    keywordTranscriptVersionRef.current = 0;
  }

  function markSpeechStarted() {
    pendingSpeechRef.current = true;
    currentSpeechStartedAtRef.current = Date.now();
  }

  function markSpeechStopped() {
    pendingSpeechRef.current = true;
  }

  function clearPendingSpeech() {
    pendingSpeechRef.current = false;
    currentSpeechStartedAtRef.current = 0;
  }

  function isPendingSpeech() {
    return pendingSpeechRef.current;
  }

  function registerTranscriptEvent(event: OverlayTranscriptEvent) {
    if (!event.transcriptText || event.speaker === "candidate" || event.speaker === "system") {
      return null;
    }

    const quality = classifyTranscriptQuality(event.transcriptText);
    if (quality.status !== "accept") {
      rememberRejectedTranscript("dev", event.transcriptText, quality, event.capturedAt || new Date().toISOString());
      return null;
    }

    const fingerprint = buildTranscriptEventFingerprint(event);
    if (lastTranscriptEventFingerprintRef.current === fingerprint) {
      return null;
    }
    lastTranscriptEventFingerprintRef.current = fingerprint;

    return registerTranscriptText({
      text: event.transcriptText,
      itemId: event.itemId,
      previousItemId: event.previousItemId,
      capturedAt: event.capturedAt || new Date().toISOString()
    });
  }

  function registerTranscriptDelta(input: {
    itemId: string;
    previousItemId?: string;
    delta: string;
    capturedAt: string;
  }) {
    const existing = transcriptDeltaItemsRef.current.get(input.itemId);
    const nextText = `${existing?.text || ""}${input.delta}`.replace(/\s+/g, " ").trim();
    const quality = classifyTranscriptQuality(nextText);
    if (!nextText || quality.status !== "accept") {
      if (nextText) {
        transcriptDeltaItemsRef.current.delete(input.itemId);
        rememberRejectedTranscript("realtime", nextText, quality, input.capturedAt);
      }
      return;
    }

    transcriptDeltaItemsRef.current.set(input.itemId, {
      text: nextText,
      previousItemId: input.previousItemId || existing?.previousItemId,
      capturedAt: input.capturedAt
    });

    if (nextText.length < 12) {
      return;
    }

    const interimTurn: ConversationTurn = {
      itemId: input.itemId,
      previousItemId: input.previousItemId || existing?.previousItemId,
      speaker: "interviewer",
      text: nextText,
      capturedAt: input.capturedAt,
      sequence: transcriptSequenceRef.current + 0.5
    };
    interimTranscriptRef.current = interimTurn;
    rebuildConversationFromTranscriptItems(interimTurn);
  }

  function registerTranscriptText(input: {
    text: string;
    itemId?: string;
    previousItemId?: string;
    capturedAt: string;
  }) {
    const normalized = input.text.replace(/\s+/g, " ").trim();
    const quality = classifyTranscriptQuality(normalized);
    if (!normalized || quality.status !== "accept") {
      if (normalized) {
        rememberRejectedTranscript("realtime", normalized, quality, input.capturedAt);
      }
      return null;
    }

    const itemId = input.itemId || `local-${input.capturedAt}-${normalized.slice(0, 24)}`;
    ensureTranscriptOrder(itemId, input.previousItemId);

    const existing = transcriptItemsRef.current.get(itemId);
    if (existing && existing.text === normalized && existing.capturedAt === input.capturedAt) {
      return existing;
    }

    const turn: ConversationTurn = {
      itemId,
      previousItemId: input.previousItemId,
      speaker: "interviewer",
      text: normalized,
      capturedAt: input.capturedAt,
      sequence: existing?.sequence || ++transcriptSequenceRef.current
    };

    transcriptItemsRef.current.set(itemId, turn);
    if (interimTranscriptRef.current?.itemId === itemId) {
      interimTranscriptRef.current = null;
    }
    rebuildConversationFromTranscriptItems();
    return turn;
  }

  function registerCompletedTranscript(input: {
    transcriptText: string;
    itemId?: string;
    previousItemId?: string;
    capturedAt: string;
  }) {
    const deltaText = input.itemId ? transcriptDeltaItemsRef.current.get(input.itemId)?.text : "";
    const matchingInterimText = interimTranscriptRef.current
      && (!input.itemId || interimTranscriptRef.current.itemId === input.itemId || areSameTranscript(interimTranscriptRef.current.text, input.transcriptText))
      ? interimTranscriptRef.current.text
      : "";
    const completedTranscriptText = chooseMostCompleteTranscript(input.transcriptText, deltaText, matchingInterimText);
    if (input.itemId) {
      transcriptDeltaItemsRef.current.delete(input.itemId);
      if (interimTranscriptRef.current?.itemId === input.itemId) {
        interimTranscriptRef.current = null;
      }
    }
    if (interimTranscriptRef.current && areSameTranscript(interimTranscriptRef.current.text, input.transcriptText)) {
      interimTranscriptRef.current = null;
    }

    const turn = registerTranscriptText({
      text: completedTranscriptText,
      itemId: input.itemId,
      previousItemId: input.previousItemId,
      capturedAt: input.capturedAt
    });

    return {
      turn,
      completedTranscriptText
    };
  }

  function rememberRejectedTranscript(
    source: RejectedTranscriptMetadata["source"],
    text: string,
    quality: TranscriptQualityResult,
    capturedAt: string
  ) {
    lastRejectedTranscriptRef.current = {
      source,
      reason: quality.reason || "unknown",
      status: quality.status,
      capturedAt,
      sample: text.slice(0, 160)
    };
  }

  function ensureTranscriptOrder(itemId: string, previousItemId?: string) {
    if (transcriptOrderRef.current.includes(itemId)) {
      return;
    }

    if (previousItemId) {
      const previousIndex = transcriptOrderRef.current.indexOf(previousItemId);
      if (previousIndex >= 0) {
        transcriptOrderRef.current.splice(previousIndex + 1, 0, itemId);
        return;
      }
    }

    transcriptOrderRef.current.push(itemId);
  }

  function rebuildConversationFromTranscriptItems(interimTurn?: ConversationTurn | null) {
    const orderedTurns = transcriptOrderRef.current
      .map((itemId) => transcriptItemsRef.current.get(itemId))
      .filter((turn): turn is ConversationTurn => Boolean(turn))
      .slice(-20);
    const visibleTurns = interimTurn && !orderedTurns.some((turn) => turn.itemId === interimTurn.itemId)
      ? [...orderedTurns, interimTurn]
      : orderedTurns;

    conversationTurnsRef.current = orderedTurns;
    recentTranscriptRef.current = orderedTurns.map((turn) => turn.text).slice(-8);

    const nextWindow = buildConversationWindow(visibleTurns);
    const latestTurn = visibleTurns.at(-1);
    const nextFocus = deriveLatestConversationFocus(nextWindow, latestTurn?.text || "", contextRef.current) || waitingFocusText;

    conversationWindowRef.current = nextWindow;
    latestFocusRef.current = nextFocus;
    setLatestFocus(nextFocus);
    publishKeywordTranscriptVersion(nextFocus, nextWindow, latestTurn);
    if (!interimTurn) {
      publishStableConversation(nextFocus, nextWindow, latestTurn);
    }
    updateOverlayContext({
      latestQuestion: nextFocus
    });
  }

  function publishKeywordTranscriptVersion(focus: string, windowText: string, latestTurn?: ConversationTurn) {
    const normalizedFocus = focus.trim();
    if (!latestTurn || !windowText.trim() || !normalizedFocus || normalizedFocus === waitingFocusText) {
      return;
    }

    const nextVersion = keywordTranscriptVersionRef.current + 1;
    keywordTranscriptVersionRef.current = nextVersion;
    setKeywordTranscriptVersion(nextVersion);
  }

  function publishStableConversation(focus: string, windowText: string, latestTurn?: ConversationTurn) {
    const normalizedFocus = focus.trim();
    const normalizedWindow = windowText.trim();
    if (!latestTurn || !normalizedWindow || !normalizedFocus || normalizedFocus === waitingFocusText) {
      return;
    }

    const sourceVersion = stableConversationSourceVersionRef.current + 1;
    stableConversationSourceVersionRef.current = sourceVersion;
    lastStableConversationRef.current = {
      focus: normalizedFocus,
      windowText: normalizedWindow,
      capturedAt: latestTurn.capturedAt,
      sourceVersion,
      conversationMode: classifyMeetingConversationMode(`${normalizedWindow}\n${normalizedFocus}`)
    };
    setStableConversationVersion(sourceVersion);
  }

  function getRecentTranscriptText() {
    const maxLength = 1400;
    const joined = conversationWindowRef.current || recentTranscriptRef.current.join("\n").trim();
    if (joined.length <= maxLength) {
      return joined;
    }

    return joined.slice(joined.length - maxLength).trim();
  }

  function getKeywordConversationSnapshot(options: {
    maxAgeMs?: number;
  } = {}) {
    const latestInterimTurn = interimTranscriptRef.current;
    if (latestInterimTurn) {
      const interimWindow = buildConversationWindow([
        ...conversationTurnsRef.current.filter((turn) => turn.itemId !== latestInterimTurn.itemId).slice(-9),
        latestInterimTurn
      ]);
      const interimFocus = deriveLatestConversationFocus(interimWindow, latestInterimTurn.text, contextRef.current);
      const interimSnapshot = buildConversationSnapshot(interimFocus, interimWindow, latestInterimTurn, options.maxAgeMs);
      if (interimSnapshot) {
        return interimSnapshot;
      }
    }

    return getStableConversationSnapshot(options);
  }

  function buildConversationSnapshot(
    focus: string,
    windowText: string,
    turn: ConversationTurn,
    maxAgeMs?: number
  ): StableConversationSnapshot | null {
    const normalizedFocus = focus.trim();
    const normalizedWindow = windowText.trim();
    if (!normalizedFocus || normalizedFocus === waitingFocusText || !normalizedWindow) {
      return null;
    }

    const capturedTime = new Date(turn.capturedAt).getTime();
    if (!Number.isFinite(capturedTime)) {
      return null;
    }

    if (typeof maxAgeMs === "number" && Date.now() - capturedTime > maxAgeMs) {
      return null;
    }

    return {
      focus: normalizedFocus,
      windowText: normalizedWindow,
      capturedAt: turn.capturedAt,
      sourceVersion: stableConversationSourceVersionRef.current,
      conversationMode: classifyMeetingConversationMode(`${normalizedWindow}\n${normalizedFocus}`)
    };
  }

  function getStableConversationSnapshot(options: {
    maxAgeMs?: number;
    blockPendingSpeech?: boolean;
  } = {}) {
    const snapshot = lastStableConversationRef.current;
    if (!snapshot) {
      return null;
    }

    const capturedTime = new Date(snapshot.capturedAt).getTime();
    if (!Number.isFinite(capturedTime)) {
      return null;
    }

    if (typeof options.maxAgeMs === "number" && Date.now() - capturedTime > options.maxAgeMs) {
      return null;
    }

    if (
      options.blockPendingSpeech
      && pendingSpeechRef.current
      && currentSpeechStartedAtRef.current
      && capturedTime < currentSpeechStartedAtRef.current
    ) {
      return null;
    }

    if (contextRef.current.realtimeStatus === "error") {
      return null;
    }

    if (!snapshot.windowText.trim()) {
      return null;
    }

    return snapshot;
  }

  function getFullTranscriptText() {
    const turns = interimTranscriptRef.current && !conversationTurnsRef.current.some((turn) => turn.itemId === interimTranscriptRef.current?.itemId)
      ? [...conversationTurnsRef.current, interimTranscriptRef.current]
      : conversationTurnsRef.current;
    const transcript = turns
      .map((turn) => turn.text)
      .filter(Boolean)
      .join("\n")
      .trim();

    return transcript || `Meeting untuk ${contextRef.current.contextName || "context"} - ${contextRef.current.meetingTopic || "topic"}. Transcript live belum tertangkap.`;
  }

  return {
    latestFocusRef,
    reset,
    markSpeechStarted,
    markSpeechStopped,
    clearPendingSpeech,
    isPendingSpeech,
    ensureTranscriptOrder,
    registerTranscriptEvent,
    registerTranscriptDelta,
    registerCompletedTranscript,
    registerTranscriptText,
    getRecentTranscriptText,
    getKeywordConversationSnapshot,
    getStableConversationSnapshot,
    getFullTranscriptText
  };
}

function buildTranscriptEventFingerprint(event: OverlayTranscriptEvent) {
  return [
    event.itemId || "",
    event.previousItemId || "",
    event.speaker || "",
    event.isFinal ? "final" : "partial",
    normalizeRuntimeFingerprintText(event.transcriptText)
  ].join("::");
}

function normalizeRuntimeFingerprintText(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}
