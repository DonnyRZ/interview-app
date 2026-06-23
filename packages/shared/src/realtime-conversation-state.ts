import type { RealtimeContext } from "./schemas/live-meeting.schema.js";
import {
  areSameTranscript,
  buildConversationWindow,
  chooseMostCompleteTranscript,
  classifyMeetingConversationMode,
  classifyTranscriptQuality,
  deriveLatestConversationFocus,
  type ConversationMode,
  type TranscriptQualityResult
} from "./transcript-focus-rules.js";

export type RealtimeConversationContext = {
  contextName?: string;
  meetingTopic?: string;
  realtimeContext?: RealtimeContext;
  realtimeStatus?: string;
  domainLabel?: string;
};

export type RealtimeConversationTurn = {
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

export type RejectedTranscriptMetadata = {
  source: "realtime" | "dev";
  reason: string;
  status: TranscriptQualityResult["status"];
  capturedAt: string;
  sample: string;
};

export type ConversationStateUpdate = {
  focus: string;
  windowText: string;
  stableVersion: number;
  keywordVersion: number;
  stable: StableConversationSnapshot | null;
};

type ConversationStateOptions = {
  waitingFocusText: string;
  getContext: () => RealtimeConversationContext;
  onUpdate?: (update: ConversationStateUpdate) => void;
};

export class RealtimeConversationState {
  private recentTranscript: string[] = [];
  private conversationTurns: RealtimeConversationTurn[] = [];
  private transcriptItems = new Map<string, RealtimeConversationTurn>();
  private transcriptOrder: string[] = [];
  private transcriptDeltaItems = new Map<string, { text: string; previousItemId?: string; capturedAt: string }>();
  private interimTranscript: RealtimeConversationTurn | null = null;
  private lastTranscriptEventFingerprint = "";
  private transcriptSequence = 0;
  private pendingSpeech = false;
  private currentSpeechStartedAt = 0;
  private latestFocus: string;
  private conversationWindow = "";
  private lastStableConversation: StableConversationSnapshot | null = null;
  private lastRejectedTranscript: RejectedTranscriptMetadata | null = null;
  private stableConversationSourceVersion = 0;
  private keywordTranscriptVersion = 0;

  constructor(private readonly options: ConversationStateOptions) {
    this.latestFocus = options.waitingFocusText;
  }

  reset() {
    this.recentTranscript = [];
    this.conversationTurns = [];
    this.transcriptItems = new Map();
    this.transcriptOrder = [];
    this.transcriptDeltaItems = new Map();
    this.interimTranscript = null;
    this.lastTranscriptEventFingerprint = "";
    this.transcriptSequence = 0;
    this.pendingSpeech = false;
    this.currentSpeechStartedAt = 0;
    this.latestFocus = this.options.waitingFocusText;
    this.conversationWindow = "";
    this.lastStableConversation = null;
    this.lastRejectedTranscript = null;
    this.stableConversationSourceVersion = 0;
    this.keywordTranscriptVersion = 0;
  }

  markSpeechStarted(now = Date.now()) {
    this.pendingSpeech = true;
    this.currentSpeechStartedAt = now;
  }

  markSpeechStopped() {
    this.pendingSpeech = true;
  }

  clearPendingSpeech() {
    this.pendingSpeech = false;
    this.currentSpeechStartedAt = 0;
  }

  isPendingSpeech() {
    return this.pendingSpeech;
  }

  getLatestFocus() {
    return this.latestFocus;
  }

  getLastRejectedTranscript() {
    return this.lastRejectedTranscript;
  }

  registerTranscriptEvent(event: {
    transcriptText: string;
    itemId?: string;
    previousItemId?: string;
    speaker?: string;
    isFinal?: boolean;
    capturedAt?: string;
  }) {
    if (!event.transcriptText || event.speaker === "candidate" || event.speaker === "system") return null;
    const quality = classifyTranscriptQuality(event.transcriptText);
    if (quality.status !== "accept") {
      this.rememberRejectedTranscript("dev", event.transcriptText, quality, event.capturedAt || new Date().toISOString());
      return null;
    }
    const fingerprint = [
      event.itemId || "",
      event.previousItemId || "",
      event.speaker || "",
      event.isFinal ? "final" : "partial",
      normalizeFingerprint(event.transcriptText)
    ].join("::");
    if (this.lastTranscriptEventFingerprint === fingerprint) return null;
    this.lastTranscriptEventFingerprint = fingerprint;
    return this.registerTranscriptText({
      text: event.transcriptText,
      itemId: event.itemId,
      previousItemId: event.previousItemId,
      capturedAt: event.capturedAt || new Date().toISOString()
    });
  }

  ensureTranscriptOrder(itemId: string, previousItemId?: string) {
    if (this.transcriptOrder.includes(itemId)) return;
    if (previousItemId) {
      const previousIndex = this.transcriptOrder.indexOf(previousItemId);
      if (previousIndex >= 0) {
        this.transcriptOrder.splice(previousIndex + 1, 0, itemId);
        return;
      }
    }
    this.transcriptOrder.push(itemId);
  }

  registerTranscriptDelta(input: { itemId: string; previousItemId?: string; delta: string; capturedAt: string }) {
    const existing = this.transcriptDeltaItems.get(input.itemId);
    const nextText = `${existing?.text || ""}${input.delta}`.replace(/\s+/g, " ").trim();
    const quality = classifyTranscriptQuality(nextText);
    if (!nextText || quality.status !== "accept") {
      if (nextText) {
        this.transcriptDeltaItems.delete(input.itemId);
        this.rememberRejectedTranscript("realtime", nextText, quality, input.capturedAt);
      }
      return null;
    }
    this.transcriptDeltaItems.set(input.itemId, {
      text: nextText,
      previousItemId: input.previousItemId || existing?.previousItemId,
      capturedAt: input.capturedAt
    });
    if (nextText.length < 12) return null;
    const interimTurn: RealtimeConversationTurn = {
      itemId: input.itemId,
      previousItemId: input.previousItemId || existing?.previousItemId,
      speaker: "interviewer",
      text: nextText,
      capturedAt: input.capturedAt,
      sequence: this.transcriptSequence + 0.5
    };
    this.interimTranscript = interimTurn;
    return this.rebuildConversation(interimTurn);
  }

  registerCompletedTranscript(input: {
    transcriptText: string;
    itemId?: string;
    previousItemId?: string;
    capturedAt: string;
  }) {
    const deltaText = input.itemId ? this.transcriptDeltaItems.get(input.itemId)?.text : "";
    const matchingInterimText = this.interimTranscript
      && (!input.itemId || this.interimTranscript.itemId === input.itemId || areSameTranscript(this.interimTranscript.text, input.transcriptText))
      ? this.interimTranscript.text
      : "";
    const completedTranscriptText = chooseMostCompleteTranscript(input.transcriptText, deltaText, matchingInterimText);
    if (input.itemId) {
      this.transcriptDeltaItems.delete(input.itemId);
      if (this.interimTranscript?.itemId === input.itemId) this.interimTranscript = null;
    }
    if (this.interimTranscript && areSameTranscript(this.interimTranscript.text, input.transcriptText)) this.interimTranscript = null;
    const turn = this.registerTranscriptText({
      text: completedTranscriptText,
      itemId: input.itemId,
      previousItemId: input.previousItemId,
      capturedAt: input.capturedAt
    });
    return { turn, completedTranscriptText, update: turn ? this.currentUpdate() : null };
  }

  registerTranscriptText(input: { text: string; itemId?: string; previousItemId?: string; capturedAt: string }) {
    const normalized = input.text.replace(/\s+/g, " ").trim();
    const quality = classifyTranscriptQuality(normalized);
    if (!normalized || quality.status !== "accept") {
      if (normalized) this.rememberRejectedTranscript("realtime", normalized, quality, input.capturedAt);
      return null;
    }
    const itemId = input.itemId || `local-${input.capturedAt}-${normalized.slice(0, 24)}`;
    this.ensureTranscriptOrder(itemId, input.previousItemId);
    const existing = this.transcriptItems.get(itemId);
    if (existing && existing.text === normalized && existing.capturedAt === input.capturedAt) return existing;
    const turn: RealtimeConversationTurn = {
      itemId,
      previousItemId: input.previousItemId,
      speaker: "interviewer",
      text: normalized,
      capturedAt: input.capturedAt,
      sequence: existing?.sequence || ++this.transcriptSequence
    };
    this.transcriptItems.set(itemId, turn);
    if (this.interimTranscript?.itemId === itemId) this.interimTranscript = null;
    this.rebuildConversation();
    return turn;
  }

  getRecentTranscriptText() {
    const joined = this.conversationWindow || this.recentTranscript.join("\n").trim();
    return joined.length <= 1400 ? joined : joined.slice(joined.length - 1400).trim();
  }

  getTranscriptHistory() {
    return [...this.recentTranscript];
  }

  getFullTranscriptText() {
    const turns = this.interimTranscript && !this.conversationTurns.some((turn) => turn.itemId === this.interimTranscript?.itemId)
      ? [...this.conversationTurns, this.interimTranscript]
      : this.conversationTurns;
    return turns.map((turn) => turn.text).filter(Boolean).join("\n").trim();
  }

  getStableConversationSnapshot(options: { maxAgeMs?: number; blockPendingSpeech?: boolean } = {}) {
    const snapshot = this.lastStableConversation;
    if (!snapshot) return null;
    const capturedTime = new Date(snapshot.capturedAt).getTime();
    if (!Number.isFinite(capturedTime)) return null;
    if (typeof options.maxAgeMs === "number" && Date.now() - capturedTime > options.maxAgeMs) return null;
    if (options.blockPendingSpeech && this.pendingSpeech && this.currentSpeechStartedAt && capturedTime < this.currentSpeechStartedAt) return null;
    if (this.options.getContext().realtimeStatus === "error" || !snapshot.windowText.trim()) return null;
    return snapshot;
  }

  getKeywordConversationSnapshot(options: { maxAgeMs?: number } = {}) {
    const latestInterimTurn = this.interimTranscript;
    if (latestInterimTurn) {
      const interimWindow = buildConversationWindow([
        ...this.conversationTurns.filter((turn) => turn.itemId !== latestInterimTurn.itemId).slice(-9),
        latestInterimTurn
      ]);
      const interimFocus = deriveLatestConversationFocus(interimWindow, latestInterimTurn.text, this.options.getContext());
      const interimSnapshot = this.buildSnapshot(interimFocus, interimWindow, latestInterimTurn, options.maxAgeMs);
      if (interimSnapshot) return interimSnapshot;
    }
    return this.getStableConversationSnapshot(options);
  }

  private rebuildConversation(interimTurn?: RealtimeConversationTurn | null) {
    const orderedTurns = this.transcriptOrder
      .map((itemId) => this.transcriptItems.get(itemId))
      .filter((turn): turn is RealtimeConversationTurn => Boolean(turn))
      .slice(-20);
    const visibleTurns = interimTurn && !orderedTurns.some((turn) => turn.itemId === interimTurn.itemId)
      ? [...orderedTurns, interimTurn]
      : orderedTurns;
    this.conversationTurns = orderedTurns;
    this.recentTranscript = orderedTurns.map((turn) => turn.text).slice(-8);
    const nextWindow = buildConversationWindow(visibleTurns);
    const latestTurn = visibleTurns.at(-1);
    const nextFocus = deriveLatestConversationFocus(nextWindow, latestTurn?.text || "", this.options.getContext()) || this.options.waitingFocusText;
    this.conversationWindow = nextWindow;
    this.latestFocus = nextFocus;
    if (latestTurn && nextWindow.trim() && nextFocus !== this.options.waitingFocusText) this.keywordTranscriptVersion += 1;
    if (!interimTurn && latestTurn) {
      const snapshot = this.buildSnapshot(nextFocus, nextWindow, latestTurn);
      if (snapshot) {
        this.stableConversationSourceVersion += 1;
        this.lastStableConversation = { ...snapshot, sourceVersion: this.stableConversationSourceVersion };
      }
    }
    const update = this.currentUpdate();
    this.options.onUpdate?.(update);
    return update;
  }

  private buildSnapshot(focus: string, windowText: string, turn: RealtimeConversationTurn, maxAgeMs?: number): StableConversationSnapshot | null {
    const normalizedFocus = focus.trim();
    const normalizedWindow = windowText.trim();
    if (!normalizedFocus || normalizedFocus === this.options.waitingFocusText || !normalizedWindow) return null;
    const capturedTime = new Date(turn.capturedAt).getTime();
    if (!Number.isFinite(capturedTime)) return null;
    if (typeof maxAgeMs === "number" && Date.now() - capturedTime > maxAgeMs) return null;
    return {
      focus: normalizedFocus,
      windowText: normalizedWindow,
      capturedAt: turn.capturedAt,
      sourceVersion: this.stableConversationSourceVersion,
      conversationMode: classifyMeetingConversationMode(`${normalizedWindow}\n${normalizedFocus}`)
    };
  }

  private currentUpdate(): ConversationStateUpdate {
    return {
      focus: this.latestFocus,
      windowText: this.conversationWindow,
      stableVersion: this.stableConversationSourceVersion,
      keywordVersion: this.keywordTranscriptVersion,
      stable: this.lastStableConversation
    };
  }

  private rememberRejectedTranscript(source: RejectedTranscriptMetadata["source"], text: string, quality: TranscriptQualityResult, capturedAt: string) {
    this.lastRejectedTranscript = {
      source,
      reason: quality.reason || "unknown",
      status: quality.status,
      capturedAt,
      sample: text.slice(0, 160)
    };
  }
}

function normalizeFingerprint(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}
