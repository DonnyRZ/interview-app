import {
  buildRealtimeActionPrompt,
  buildRealtimeCancelEvent,
  extractRealtimeResponseText,
  formatRealtimeResponsePoints,
  getExplicitActionConversationMode,
  getRealtimeRateLimitState,
  getRealtimeActionTitle,
  getRealtimeResponseDoneState,
  getRealtimeResponseId,
  isConversationHelpActionName,
  isRecoverableRealtimeCancelError,
  parseRealtimeKeywords
} from "@interview-app/shared/realtime-overlay";
import type {
  RealtimeActionName,
  RealtimeActionPromptPayload,
  RealtimeConversationMode
} from "@interview-app/shared/realtime-overlay";
import {
  RealtimeConversationState,
  type RealtimeContext
} from "@interview-app/shared";
import { buildKeywordSourceText } from "@interview-app/shared/transcript-focus-rules";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createRealtimeClientSecret,
  endLiveMeeting,
  startLiveMeeting,
  type RealtimeClientSecret
} from "./realtime-api.js";
import {
  canClaimRealtimeResponseId,
  hasRealtimeResponseIdConflict,
  isRealtimeResponseOwnedBy
} from "./realtime-response-ownership.js";

export type RealtimeTranscriptionStatus = "idle" | "connecting" | "listening" | "transcribing" | "error";
export type MeetingHelpMode = "idle" | "loading" | "response";
export type MeetingHelpAction = Exclude<RealtimeActionName, "answer">;

export type MeetingHelpResponse = {
  title: string;
  points: string[];
  kind: "help" | "notice";
};

export type MeetingHelpController = {
  mode: MeetingHelpMode;
  activeResponse: MeetingHelpResponse | null;
  recentHelp: MeetingHelpResponse[];
  keywords: string[];
  enabled: boolean;
  requestHelp(action: MeetingHelpAction, triggerText?: string): void;
  closeResponse(): void;
};

type RealtimeTranscriptionState = {
  status: RealtimeTranscriptionStatus;
  message: string;
  latestTranscript: string;
  interimTranscript: string;
  transcriptHistory: string[];
};

type MeetingHelpState = {
  mode: MeetingHelpMode;
  activeResponse: MeetingHelpResponse | null;
  recentHelp: MeetingHelpResponse[];
  keywords: string[];
};

type AudioSource = {
  subscribePcm16(callback: (chunk: Uint8Array) => void): () => void;
  hasSignal(): boolean;
};

type ActiveHelpResponse = {
  requestId: number;
  responseId?: string;
  action?: MeetingHelpAction;
  conversationMode?: RealtimeConversationMode;
  sourceText?: string;
  payload?: RealtimeActionPromptPayload;
  retryCount?: number;
  nonCompletedRetryCount?: number;
  rateLimitRetryCount?: number;
  canceled?: boolean;
};

type ActiveKeywordResponse = {
  requestId: number;
  generation: number;
  requestKey: string;
  fingerprint: string;
  responseId?: string;
  canceled?: boolean;
};

type PendingKeywordRequest = {
  requestKey: string;
  fingerprint: string;
  generation: number;
  transcript: string;
};

type ResponseSlotState = "idle" | "creating" | "active" | "canceling";

type QueuedHelpRequest = {
  requestId: number;
  title: string;
  action: MeetingHelpAction;
  conversationMode?: RealtimeConversationMode;
  sourceText: string;
  payload: RealtimeActionPromptPayload;
  retryCount: number;
  nonCompletedRetryCount: number;
  rateLimitRetryCount: number;
  settleUntil?: number;
};

const realtimeResponseSettleMs = 700;
const realtimeResponseRetryDelayMs = 850;
const realtimeResponseMaxNonCompletedRetries = 4;
const realtimeRateLimitSafetyMs = 450;
const realtimeRateLimitJitterMs = 350;
const realtimeRateLimitMaxRetryDelayMs = 20_000;
const realtimeRateLimitMaxRetries = 2;
const realtimeHelpMaxOutputTokens = 260;
const realtimeKeywordMaxOutputTokens = 48;
const realtimeHelpTranscriptMaxChars = 900;
const realtimeKeywordTranscriptMaxChars = 520;
const realtimeFocusMaxChars = 360;
const realtimeTriggerMaxChars = 160;

const initialState: RealtimeTranscriptionState = {
  status: "idle",
  message: "Realtime belum dimulai.",
  latestTranscript: "",
  interimTranscript: "",
  transcriptHistory: []
};

const initialHelpState: MeetingHelpState = {
  mode: "idle",
  activeResponse: null,
  recentHelp: [],
  keywords: []
};

export function useRealtimeTranscription(audio: AudioSource) {
  const [state, setState] = useState<RealtimeTranscriptionState>(initialState);
  const [helpState, setHelpState] = useState<MeetingHelpState>(initialHelpState);
  const socketRef = useRef<WebSocket | null>(null);
  const unsubscribeAudioRef = useRef<(() => void) | null>(null);
  const liveMeetingSessionIdRef = useRef("");
  const latestTranscriptRef = useRef("");
  const speechPendingRef = useRef(false);
  const speechStartedAtRef = useRef(0);
  const realtimeContextRef = useRef<RealtimeContext | undefined>(undefined);
  const shouldRunRef = useRef(false);
  const secretRef = useRef<RealtimeClientSecret | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const activeHelpRealtimeResponseRef = useRef<ActiveHelpResponse | null>(null);
  const activeKeywordResponseRef = useRef<ActiveKeywordResponse | null>(null);
  const ignoredResponseIdsRef = useRef(new Set<string>());
  const helpResponseBufferRef = useRef("");
  const keywordResponseBufferRef = useRef("");
  const helpRequestIdRef = useRef(0);
  const keywordRequestIdRef = useRef(0);
  const keywordGenerationRef = useRef(0);
  const ignoredUnclaimedResponseCreatesRef = useRef(0);
  const responseSlotStateRef = useRef<ResponseSlotState>("idle");
  const responseSlotFallbackTimerRef = useRef<number | null>(null);
  const queuedHelpRequestRef = useRef<QueuedHelpRequest | null>(null);
  const drainQueuedRealtimeWorkRef = useRef<() => void>(() => undefined);
  const realtimeSettleUntilRef = useRef(0);
  const realtimeRateLimitUntilRef = useRef(0);
  const activeDisplayedHelpResponseRef = useRef<MeetingHelpResponse | null>(null);
  const activeHelpFinalRef = useRef(false);
  const pendingKeywordRequestRef = useRef<PendingKeywordRequest | null>(null);
  const keywordLastRequestedKeyRef = useRef("");
  const keywordTimerRef = useRef<number | null>(null);
  const handleServerEventRef = useRef<(data: unknown) => void>(() => undefined);
  const connectRef = useRef<(secret: RealtimeClientSecret) => void>(() => undefined);
  const conversationStateRef = useRef<RealtimeConversationState | null>(null);
  if (!conversationStateRef.current) {
    conversationStateRef.current = new RealtimeConversationState({
      waitingFocusText: "Belum ada konteks percakapan tertangkap.",
      getContext: () => ({ realtimeContext: realtimeContextRef.current })
    });
  }

  const updateHelpState = useCallback((updater: (current: MeetingHelpState) => MeetingHelpState) => {
    setHelpState((current) => {
      const next = updater(current);
      activeDisplayedHelpResponseRef.current = next.activeResponse;
      return next;
    });
  }, []);

  const sendClientEvent = useCallback((event: Record<string, unknown>) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(event));
    return true;
  }, []);

  function isResponseSlotIdle() {
    return responseSlotStateRef.current === "idle"
      && !activeHelpRealtimeResponseRef.current
      && !activeKeywordResponseRef.current;
  }

  function clearResponseSlotFallbackTimer() {
    if (responseSlotFallbackTimerRef.current !== null) window.clearTimeout(responseSlotFallbackTimerRef.current);
    responseSlotFallbackTimerRef.current = null;
  }

  function requestQueuedRealtimeWorkDrain(delay = 0) {
    window.setTimeout(() => drainQueuedRealtimeWorkRef.current(), delay);
  }

  function releaseResponseSlot() {
    responseSlotStateRef.current = "idle";
    clearResponseSlotFallbackTimer();
    requestQueuedRealtimeWorkDrain();
  }

  function scheduleResponseSlotFallback(delay = 3_500) {
    clearResponseSlotFallbackTimer();
    responseSlotFallbackTimerRef.current = window.setTimeout(() => {
      responseSlotFallbackTimerRef.current = null;
      if (responseSlotStateRef.current === "idle") return;
      if (activeHelpRealtimeResponseRef.current?.canceled) activeHelpRealtimeResponseRef.current = null;
      if (activeKeywordResponseRef.current?.canceled) activeKeywordResponseRef.current = null;
      helpResponseBufferRef.current = "";
      keywordResponseBufferRef.current = "";
      responseSlotStateRef.current = "idle";
      requestQueuedRealtimeWorkDrain();
    }, delay);
  }

  function markRealtimeSettleWindow(delay = realtimeResponseSettleMs) {
    realtimeSettleUntilRef.current = Math.max(realtimeSettleUntilRef.current, Date.now() + delay);
  }

  function getRealtimeSettleDelay() {
    return Math.max(0, realtimeSettleUntilRef.current - Date.now());
  }

  function getRateLimitCooldownDelay() {
    return Math.max(0, realtimeRateLimitUntilRef.current - Date.now());
  }

  function startRateLimitCooldown(retryAfterMs: number) {
    const retryDelay = Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : 1_000;
    const jitter = Math.floor(Math.random() * realtimeRateLimitJitterMs);
    const delay = Math.min(realtimeRateLimitMaxRetryDelayMs, retryDelay + realtimeRateLimitSafetyMs + jitter);
    realtimeRateLimitUntilRef.current = Math.max(realtimeRateLimitUntilRef.current, Date.now() + delay);
    return delay;
  }

  function cloneQueuedHelpRequest(
    active: ActiveHelpResponse,
    fallbackAction: MeetingHelpAction = "explain_text"
  ): QueuedHelpRequest | null {
    if (!active.payload) return null;
    const action = active.action || fallbackAction;
    return {
      requestId: active.requestId,
      title: activeDisplayedHelpResponseRef.current?.title || getRealtimeActionTitle({ action }),
      action,
      conversationMode: active.conversationMode,
      sourceText: active.sourceText || "",
      payload: active.payload,
      retryCount: active.retryCount || 0,
      nonCompletedRetryCount: active.nonCompletedRetryCount || 0,
      rateLimitRetryCount: active.rateLimitRetryCount || 0
    };
  }

  const cancelActiveHelpResponse = useCallback(() => {
    const active = activeHelpRealtimeResponseRef.current;
    if (!active) return;
    activeHelpRealtimeResponseRef.current = { ...active, canceled: true };
    const responseId = active.responseId;
    const cancelEvent = buildRealtimeCancelEvent(responseId);
    if (cancelEvent) sendClientEvent(cancelEvent);
    helpResponseBufferRef.current = "";
    responseSlotStateRef.current = "canceling";
    scheduleResponseSlotFallback();
  }, [sendClientEvent]);

  const cancelActiveKeywordResponse = useCallback(() => {
    keywordGenerationRef.current += 1;
    const activeKeyword = activeKeywordResponseRef.current;
    if (!activeKeyword) return;
    activeKeywordResponseRef.current = { ...activeKeyword, canceled: true };
    const responseId = activeKeyword?.responseId;
    const cancelEvent = buildRealtimeCancelEvent(responseId);
    if (cancelEvent) sendClientEvent(cancelEvent);
    keywordResponseBufferRef.current = "";
    responseSlotStateRef.current = "canceling";
    scheduleResponseSlotFallback();
  }, [sendClientEvent]);

  const clearRuntimeTimers = useCallback(() => {
    if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
    if (keywordTimerRef.current !== null) window.clearTimeout(keywordTimerRef.current);
    keywordTimerRef.current = null;
    clearResponseSlotFallbackTimer();
  }, []);

  const closeTransport = useCallback(() => {
    clearRuntimeTimers();
    queuedHelpRequestRef.current = null;
    pendingKeywordRequestRef.current = null;
    cancelActiveHelpResponse();
    cancelActiveKeywordResponse();
    unsubscribeAudioRef.current?.();
    unsubscribeAudioRef.current = null;
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
  }, [cancelActiveHelpResponse, cancelActiveKeywordResponse, clearRuntimeTimers]);

  const sendResponseRequest = useCallback((payload: RealtimeActionPromptPayload, maxOutputTokens: number) => {
    const compactPayload = compactRealtimePromptPayload(payload);
    const itemSent = sendClientEvent({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: buildRealtimeActionPrompt(compactPayload) }]
      }
    });
    const responseSent = sendClientEvent({
      type: "response.create",
      response: { output_modalities: ["text"], max_output_tokens: maxOutputTokens }
    });
    return itemSent && responseSent;
  }, [sendClientEvent]);

  const flushPendingKeywords = useCallback(() => {
    if (!isResponseSlotIdle() || queuedHelpRequestRef.current || !pendingKeywordRequestRef.current) return;
    const cooldownDelay = getRateLimitCooldownDelay();
    if (cooldownDelay > 0) {
      requestQueuedRealtimeWorkDrain(cooldownDelay + 200);
      return;
    }
    const pending = pendingKeywordRequestRef.current;
    pendingKeywordRequestRef.current = null;
    const requestId = keywordRequestIdRef.current + 1;
    keywordRequestIdRef.current = requestId;
    const generation = keywordGenerationRef.current;
    keywordLastRequestedKeyRef.current = pending.requestKey;
    activeKeywordResponseRef.current = {
      requestId,
      generation,
      requestKey: pending.requestKey,
      fingerprint: pending.fingerprint
    };
    keywordResponseBufferRef.current = "";
    responseSlotStateRef.current = "creating";
    const sent = sendResponseRequest({
      action: "surface_keywords",
      latestQuestion: latestTranscriptRef.current,
      recentTranscript: pending.transcript,
      conversationMode: "unknown"
    }, realtimeKeywordMaxOutputTokens);
    if (!sent) {
      activeKeywordResponseRef.current = null;
      responseSlotStateRef.current = "idle";
      pendingKeywordRequestRef.current = pending;
    }
  }, [sendResponseRequest]);

  const schedulePendingKeywordFlush = useCallback((delay = 700) => {
    if (keywordTimerRef.current !== null) window.clearTimeout(keywordTimerRef.current);
    keywordTimerRef.current = window.setTimeout(() => {
      keywordTimerRef.current = null;
      flushPendingKeywords();
    }, delay);
  }, [flushPendingKeywords]);

  const scheduleKeywordRefresh = useCallback((transcript: string, delay = 700) => {
    const keywordSourceText = buildKeywordSourceText(latestTranscriptRef.current, transcript);
    if (!keywordSourceText.trim()) return;
    const fingerprint = buildKeywordRequestFingerprint(keywordSourceText);
    const requestKey = `${liveMeetingSessionIdRef.current || "draft"}::${fingerprint}`;
    if (
      keywordLastRequestedKeyRef.current === requestKey
      || pendingKeywordRequestRef.current?.requestKey === requestKey
    ) {
      return;
    }
    pendingKeywordRequestRef.current = {
      requestKey,
      fingerprint,
      generation: keywordGenerationRef.current,
      transcript: keywordSourceText
    };
    schedulePendingKeywordFlush(delay);
  }, [schedulePendingKeywordFlush]);

  const queueHelpRequest = useCallback((request: QueuedHelpRequest) => {
    queuedHelpRequestRef.current = request;
    if (!isResponseSlotIdle()) {
      updateHelpState((current) => ({
        ...current,
        mode: "loading",
        activeResponse: current.activeResponse
          ? { ...current.activeResponse, points: ["Menunggu respons realtime sebelumnya selesai..."] }
          : { title: request.title, kind: "help", points: ["Menunggu respons realtime sebelumnya selesai..."] }
      }));
    }
    requestQueuedRealtimeWorkDrain();
  }, [updateHelpState]);

  const drainQueuedRealtimeWork = useCallback(() => {
    if (!shouldRunRef.current) return;
    const queued = queuedHelpRequestRef.current;
    if (queued) {
      if (!isResponseSlotIdle()) return;
      const cooldownDelay = getRateLimitCooldownDelay();
      if (cooldownDelay > 0) {
        updateHelpState((current) => ({
          ...current,
          mode: "loading",
          activeResponse: current.activeResponse
            ? {
                ...current.activeResponse,
                points: [`Menunggu kapasitas realtime sebentar (${formatDelaySeconds(cooldownDelay)}).`]
              }
            : { title: queued.title, kind: "help", points: [`Menunggu kapasitas realtime sebentar (${formatDelaySeconds(cooldownDelay)}).`] }
        }));
        requestQueuedRealtimeWorkDrain(cooldownDelay + 50);
        return;
      }
      const settleDelay = Math.max(0, queued.settleUntil || 0, realtimeSettleUntilRef.current) - Date.now();
      if (settleDelay > 0) {
        requestQueuedRealtimeWorkDrain(settleDelay);
        return;
      }
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        queuedHelpRequestRef.current = null;
        updateHelpState((current) => ({
          ...current,
          mode: "response",
          activeResponse: buildNotice("Realtime Belum Aktif", "Bantuan tidak terkirim karena koneksi realtime tertutup.")
        }));
        return;
      }
      queuedHelpRequestRef.current = null;
      activeHelpRealtimeResponseRef.current = {
        requestId: queued.requestId,
        action: queued.action,
        conversationMode: queued.conversationMode,
        sourceText: queued.sourceText,
        payload: queued.payload,
        retryCount: queued.retryCount,
        nonCompletedRetryCount: queued.nonCompletedRetryCount,
        rateLimitRetryCount: queued.rateLimitRetryCount
      };
      helpResponseBufferRef.current = "";
      responseSlotStateRef.current = "creating";
      const sent = sendResponseRequest(queued.payload, realtimeHelpMaxOutputTokens);
      if (!sent) {
        activeHelpRealtimeResponseRef.current = null;
        responseSlotStateRef.current = "idle";
        updateHelpState((current) => ({
          ...current,
          mode: "response",
          activeResponse: buildNotice("Realtime Belum Aktif", "Bantuan tidak terkirim karena koneksi realtime tertutup.")
        }));
      }
      return;
    }
    flushPendingKeywords();
  }, [flushPendingKeywords, sendResponseRequest, updateHelpState]);
  drainQueuedRealtimeWorkRef.current = drainQueuedRealtimeWork;

  const handleRealtimeRateLimit = useCallback((retryAfterMs: number, fallbackActiveHelp?: ActiveHelpResponse | null) => {
    const cooldownDelay = startRateLimitCooldown(retryAfterMs);
    const activeHelp = fallbackActiveHelp || activeHelpRealtimeResponseRef.current;
    if (activeHelp?.payload && activeHelp.action && !activeHelp.canceled) {
      const retry = cloneQueuedHelpRequest(activeHelp);
      activeHelpRealtimeResponseRef.current = null;
      helpResponseBufferRef.current = "";
      if (retry && retry.rateLimitRetryCount < realtimeRateLimitMaxRetries) {
        retry.rateLimitRetryCount += 1;
        retry.settleUntil = Date.now() + cooldownDelay;
        queuedHelpRequestRef.current = retry;
        updateHelpState((current) => ({
          ...current,
          mode: "loading",
          activeResponse: current.activeResponse
            ? {
                ...current.activeResponse,
                points: [`Menunggu kapasitas realtime sebentar (${formatDelaySeconds(cooldownDelay)}).`]
              }
            : { title: retry.title, kind: "help", points: [`Menunggu kapasitas realtime sebentar (${formatDelaySeconds(cooldownDelay)}).`] }
        }));
        releaseResponseSlot();
        return true;
      }
    }
    if (activeKeywordResponseRef.current && !activeHelpRealtimeResponseRef.current) {
      activeKeywordResponseRef.current = null;
      keywordResponseBufferRef.current = "";
      pendingKeywordRequestRef.current = null;
      releaseResponseSlot();
      return true;
    }
    activeHelpFinalRef.current = false;
    releaseResponseSlot();
    updateHelpState((current) => ({
      ...current,
      mode: "response",
      activeResponse: buildNotice("Realtime Sedang Penuh", "Kapasitas realtime sedang penuh. Sistem sudah mencoba ulang; tunggu sebentar sebelum mengirim bantuan lagi.")
    }));
    return true;
  }, [updateHelpState]);

  function isCurrentHelpRequest(requestId: number) {
    return helpRequestIdRef.current === requestId;
  }

  function canKeywordUseMissingResponseIdFallback() {
    return !activeHelpRealtimeResponseRef.current;
  }

  function isActiveHelpResponseEvent(responseId: string) {
    const active = activeHelpRealtimeResponseRef.current;
    if (!active) return false;
    if (hasRealtimeResponseIdConflict(active, activeKeywordResponseRef.current, responseId)) return false;
    if (canClaimRealtimeResponseId(active, activeKeywordResponseRef.current, responseId, true)) {
      activeHelpRealtimeResponseRef.current = { ...active, responseId };
    }
    return isRealtimeResponseOwnedBy(
      activeHelpRealtimeResponseRef.current,
      responseId,
      active.canceled ? () => true : isCurrentHelpRequest,
      true
    );
  }

  function isActiveKeywordResponseEvent(responseId: string) {
    const active = activeKeywordResponseRef.current;
    if (!active || (!active.canceled && active.generation !== keywordGenerationRef.current)) return false;
    if (hasRealtimeResponseIdConflict(active, activeHelpRealtimeResponseRef.current, responseId)) return false;
    if (canClaimRealtimeResponseId(active, activeHelpRealtimeResponseRef.current, responseId, canKeywordUseMissingResponseIdFallback())) {
      activeKeywordResponseRef.current = { ...active, responseId };
      return true;
    }
    return isRealtimeResponseOwnedBy(
      activeKeywordResponseRef.current,
      responseId,
      () => true,
      canKeywordUseMissingResponseIdFallback()
    );
  }

  function claimCreatedResponse(responseId: string) {
    if (!responseId) return false;
    if (ignoredUnclaimedResponseCreatesRef.current > 0) {
      ignoredUnclaimedResponseCreatesRef.current -= 1;
      ignoredResponseIdsRef.current.add(responseId);
      return false;
    }
    const help = activeHelpRealtimeResponseRef.current;
    if (
      help
      && (isCurrentHelpRequest(help.requestId) || help.canceled)
      && !hasRealtimeResponseIdConflict(help, activeKeywordResponseRef.current, responseId)
      && canClaimRealtimeResponseId(help, activeKeywordResponseRef.current, responseId, true)
    ) {
      const claimed = { ...help, responseId };
      activeHelpRealtimeResponseRef.current = claimed;
      responseSlotStateRef.current = claimed.canceled ? "canceling" : "active";
      if (claimed.canceled) {
        const cancelEvent = buildRealtimeCancelEvent(responseId);
        if (cancelEvent) sendClientEvent(cancelEvent);
        scheduleResponseSlotFallback();
      }
      return true;
    }

    const keyword = activeKeywordResponseRef.current;
    if (
      keyword
      && (keyword.canceled || keyword.generation === keywordGenerationRef.current)
      && canClaimRealtimeResponseId(keyword, activeHelpRealtimeResponseRef.current, responseId, canKeywordUseMissingResponseIdFallback())
    ) {
      const claimed = { ...keyword, responseId };
      activeKeywordResponseRef.current = claimed;
      responseSlotStateRef.current = claimed.canceled ? "canceling" : "active";
      if (claimed.canceled) {
        const cancelEvent = buildRealtimeCancelEvent(responseId);
        if (cancelEvent) sendClientEvent(cancelEvent);
        scheduleResponseSlotFallback();
      }
      return true;
    }
    return false;
  }

  const finalizeKeywordResponse = useCallback((event: Record<string, unknown>, responseId: string) => {
    const active = activeKeywordResponseRef.current;
    if (!active) return;
    if (!isActiveKeywordResponseEvent(responseId)) return;
    const finalText = extractRealtimeResponseText(event) || keywordResponseBufferRef.current.trim();
    activeKeywordResponseRef.current = null;
    keywordResponseBufferRef.current = "";
    ignoredUnclaimedResponseCreatesRef.current = 0;
    releaseResponseSlot();
    if (!active.canceled && active.generation === keywordGenerationRef.current) {
      const keywords = parseRealtimeKeywords(finalText);
      updateHelpState((current) => ({ ...current, keywords }));
    }
    if (pendingKeywordRequestRef.current) schedulePendingKeywordFlush(500);
  }, [schedulePendingKeywordFlush, updateHelpState]);

  const finalizeHelpResponse = useCallback((event: Record<string, unknown>, responseId: string) => {
    const active = activeHelpRealtimeResponseRef.current;
    if (!active || !isActiveHelpResponseEvent(responseId)) return;
    const doneState = getRealtimeResponseDoneState(event);
    const finalText = extractRealtimeResponseText(event) || helpResponseBufferRef.current.trim();
    activeHelpRealtimeResponseRef.current = null;
    helpResponseBufferRef.current = "";

    if (active.canceled) {
      releaseResponseSlot();
      return;
    }

    if (
      doneState.status !== "completed"
      && !(doneState.status === "unknown" && finalText.trim())
      && !(doneState.status === "incomplete" && finalText.trim())
    ) {
      const rateLimit = getRealtimeRateLimitState(doneState.errorMessage);
      if (rateLimit.rateLimited) {
        handleRealtimeRateLimit(rateLimit.retryAfterMs, active);
        return;
      }
      const retryable = isRetryableRealtimeDoneState(doneState);
      const retryCount = active.nonCompletedRetryCount || 0;
      const retry = cloneQueuedHelpRequest(active);
      if (retryable && retry && retryCount < realtimeResponseMaxNonCompletedRetries) {
        retry.nonCompletedRetryCount = retryCount + 1;
        retry.settleUntil = Date.now() + realtimeResponseRetryDelayMs + getRealtimeSettleDelay();
        queuedHelpRequestRef.current = retry;
        updateHelpState((current) => ({
          ...current,
          mode: "loading",
          activeResponse: current.activeResponse
            ? { ...current.activeResponse, points: ["Menunggu realtime selesai memproses giliran bicara terbaru..."] }
            : current.activeResponse
        }));
        releaseResponseSlot();
        return;
      }

      activeHelpFinalRef.current = false;
      updateHelpState((current) => ({
        ...current,
        mode: "response",
        activeResponse: buildNotice(
          doneState.status === "failed" ? "Bantuan Realtime Gagal" : "Realtime Belum Siap",
          getRealtimeDoneNoticeMessage(doneState)
        )
      }));
      releaseResponseSlot();
      return;
    }

    if (!finalText.trim() && active.payload && (active.retryCount || 0) < 1) {
      const retry = cloneQueuedHelpRequest(active);
      if (!retry) return;
      retry.retryCount = (active.retryCount || 0) + 1;
      retry.settleUntil = Date.now() + realtimeResponseRetryDelayMs + getRealtimeSettleDelay();
      queuedHelpRequestRef.current = retry;
      updateHelpState((current) => ({
        ...current,
        mode: "loading",
        activeResponse: current.activeResponse
          ? { ...current.activeResponse, points: ["Mencoba ulang bantuan realtime..."] }
          : current.activeResponse
      }));
      releaseResponseSlot();
      return;
    }

    const points = formatRealtimeResponsePoints(finalText, {
      action: active.action,
      conversationMode: active.conversationMode,
      sourceText: active.sourceText
    });
    const response: MeetingHelpResponse = {
      title: activeDisplayedHelpResponseRef.current?.title || "Meeting Help",
      kind: "help",
      points: points.length ? points : [
        "Bantuan realtime belum menghasilkan teks.",
        "Konteks meeting tetap tersimpan; coba kirim ulang bantuan."
      ]
    };
    activeHelpFinalRef.current = true;
    updateHelpState((current) => ({ ...current, mode: "response", activeResponse: response }));
    releaseResponseSlot();
    if (pendingKeywordRequestRef.current) schedulePendingKeywordFlush(500);
  }, [schedulePendingKeywordFlush, updateHelpState]);

  handleServerEventRef.current = (data: unknown) => {
    if (typeof data !== "string") return;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(data) as Record<string, unknown>;
    } catch {
      return;
    }

    const type = typeof event.type === "string" ? event.type : "";
    const responseId = getRealtimeResponseId(event);
    if (responseId && ignoredResponseIdsRef.current.has(responseId)) {
      if (type === "response.done") {
        ignoredResponseIdsRef.current.delete(responseId);
        releaseResponseSlot();
      }
      return;
    }
    if (type === "response.created") {
      if (responseId && !claimCreatedResponse(responseId) && responseSlotStateRef.current !== "idle") {
        ignoredResponseIdsRef.current.add(responseId);
        responseSlotStateRef.current = "active";
      }
      return;
    }
    if (type === "input_audio_buffer.speech_started") {
      speechPendingRef.current = true;
      speechStartedAtRef.current = Date.now();
      markRealtimeSettleWindow();
      conversationStateRef.current?.markSpeechStarted(speechStartedAtRef.current);
      setState((current) => ({ ...current, status: "transcribing", message: "Ucapan terdeteksi...", interimTranscript: "" }));
      return;
    }
    if (type === "input_audio_buffer.speech_stopped") {
      markRealtimeSettleWindow();
      conversationStateRef.current?.markSpeechStopped();
      setState((current) => ({ ...current, status: "transcribing", message: "Ucapan selesai, menunggu transkrip..." }));
      return;
    }
    if (type === "input_audio_buffer.committed") {
      const itemId = typeof event.item_id === "string" ? event.item_id : "";
      const previousItemId = typeof event.previous_item_id === "string" ? event.previous_item_id : undefined;
      if (itemId) conversationStateRef.current?.ensureTranscriptOrder(itemId, previousItemId);
      return;
    }
    if (type === "conversation.item.input_audio_transcription.delta" && typeof event.delta === "string") {
      const itemId = typeof event.item_id === "string" && event.item_id.trim() ? event.item_id.trim() : "interim-audio";
      const previousItemId = typeof event.previous_item_id === "string" ? event.previous_item_id : undefined;
      const update = conversationStateRef.current?.registerTranscriptDelta({
        itemId,
        previousItemId,
        delta: event.delta,
        capturedAt: new Date().toISOString()
      });
      setState((current) => ({ ...current, status: "transcribing", message: "Menyusun transkrip...", interimTranscript: update?.focus || "" }));
      return;
    }
    if (type === "conversation.item.input_audio_transcription.completed") {
      speechPendingRef.current = false;
      speechStartedAtRef.current = 0;
      markRealtimeSettleWindow();
      conversationStateRef.current?.clearPendingSpeech();
      const transcript = typeof event.transcript === "string" ? normalizeTranscript(event.transcript) : "";
      if (!transcript) {
        setState((current) => ({ ...current, status: "listening", message: "Menunggu ucapan berikutnya...", interimTranscript: "" }));
        return;
      }
      const result = conversationStateRef.current?.registerCompletedTranscript({
        transcriptText: transcript,
        itemId: typeof event.item_id === "string" ? event.item_id : undefined,
        previousItemId: typeof event.previous_item_id === "string" ? event.previous_item_id : undefined,
        capturedAt: new Date().toISOString()
      });
      if (!result?.turn || !result.update?.stable) {
        setState((current) => ({
          ...current,
          status: "listening",
          message: "Transkrip terdeteksi sebagai noise; konteks terakhir dipertahankan.",
          interimTranscript: ""
        }));
        return;
      }
      const history = conversationStateRef.current?.getTranscriptHistory() || [];
      const focus = result.update.stable.focus;
      latestTranscriptRef.current = focus;
      setState((current) => ({
        ...current,
        status: "listening",
        message: "Transkrip terbaru siap.",
        latestTranscript: focus,
        interimTranscript: "",
        transcriptHistory: history
      }));
      scheduleKeywordRefresh(result.update.stable.windowText);
      return;
    }
    if (type === "response.output_text.delta" && typeof event.delta === "string") {
      if (isActiveKeywordResponseEvent(responseId)) {
        if (activeKeywordResponseRef.current?.canceled) return;
        keywordResponseBufferRef.current += event.delta;
        return;
      }
      if (!isActiveHelpResponseEvent(responseId)) return;
      if (activeHelpRealtimeResponseRef.current?.canceled) return;
      helpResponseBufferRef.current += event.delta;
      const active = activeHelpRealtimeResponseRef.current;
      const points = formatRealtimeResponsePoints(helpResponseBufferRef.current, {
        action: active?.action,
        conversationMode: active?.conversationMode,
        sourceText: active?.sourceText
      });
      updateHelpState((current) => ({
        ...current,
        mode: "response",
        activeResponse: current.activeResponse
          ? { ...current.activeResponse, points: points.length ? points : ["Menyiapkan bantuan realtime..."] }
          : current.activeResponse
      }));
      return;
    }
    if (type === "response.output_text.done" && typeof event.text === "string") {
      if (isActiveKeywordResponseEvent(responseId)) {
        if (activeKeywordResponseRef.current?.canceled) return;
        if (!keywordResponseBufferRef.current.trim()) keywordResponseBufferRef.current = event.text;
        return;
      }
      if (!isActiveHelpResponseEvent(responseId)) return;
      if (activeHelpRealtimeResponseRef.current?.canceled) return;
      if (!helpResponseBufferRef.current.trim()) helpResponseBufferRef.current = event.text;
      return;
    }
    if (type === "response.done") {
      if (isActiveKeywordResponseEvent(responseId)) {
        finalizeKeywordResponse(event, responseId);
        return;
      }
      finalizeHelpResponse(event, responseId);
      return;
    }
    if (type === "error") {
      const error = event.error && typeof event.error === "object" ? event.error as Record<string, unknown> : null;
      const message = typeof error?.message === "string" ? error.message : "OpenAI Realtime mengembalikan error.";
      if (isRecoverableRealtimeCancelError(message)) return;
      const rateLimit = getRealtimeRateLimitState(message);
      if (rateLimit.rateLimited) {
        handleRealtimeRateLimit(rateLimit.retryAfterMs);
        return;
      }
      if (isActiveResponseInProgressError(message)) {
        const activeHelp = activeHelpRealtimeResponseRef.current;
        if (activeHelp?.payload && activeHelp.action && !activeHelp.canceled) {
          queuedHelpRequestRef.current = {
            requestId: activeHelp.requestId,
            title: activeDisplayedHelpResponseRef.current?.title || getRealtimeActionTitle({ action: activeHelp.action }),
            action: activeHelp.action,
            conversationMode: activeHelp.conversationMode,
            sourceText: activeHelp.sourceText || "",
            payload: activeHelp.payload,
            retryCount: activeHelp.retryCount || 0,
            nonCompletedRetryCount: activeHelp.nonCompletedRetryCount || 0,
            rateLimitRetryCount: activeHelp.rateLimitRetryCount || 0,
            settleUntil: Date.now() + realtimeResponseRetryDelayMs
          };
          activeHelpRealtimeResponseRef.current = null;
          helpResponseBufferRef.current = "";
          updateHelpState((current) => ({
            ...current,
            mode: "loading",
            activeResponse: current.activeResponse
              ? { ...current.activeResponse, points: ["Menunggu respons realtime sebelumnya selesai..."] }
              : current.activeResponse
          }));
        }
        if (activeKeywordResponseRef.current && !activeKeywordResponseRef.current.responseId && !activeKeywordResponseRef.current.canceled) {
          activeKeywordResponseRef.current = null;
          keywordResponseBufferRef.current = "";
        }
        responseSlotStateRef.current = "canceling";
        scheduleResponseSlotFallback(1_200);
        return;
      }
      if (activeKeywordResponseRef.current && !activeHelpRealtimeResponseRef.current) {
        activeKeywordResponseRef.current = null;
        keywordResponseBufferRef.current = "";
        releaseResponseSlot();
        if (pendingKeywordRequestRef.current) schedulePendingKeywordFlush(1_000);
        return;
      }
      if (activeHelpRealtimeResponseRef.current) {
        activeHelpRealtimeResponseRef.current = null;
        helpResponseBufferRef.current = "";
        releaseResponseSlot();
        activeHelpFinalRef.current = false;
        updateHelpState((current) => ({
          ...current,
          mode: "response",
          activeResponse: buildNotice("Bantuan Realtime Gagal", message)
        }));
        return;
      }
      setState((current) => ({ ...current, status: "error", message }));
    }
  };

  const connect = useCallback((secret: RealtimeClientSecret) => {
    if (!shouldRunRef.current) return;
    const socket = new WebSocket(
      `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(secret.model)}`,
      ["realtime", `openai-insecure-api-key.${secret.clientSecret}`]
    );
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      if (socketRef.current !== socket || !shouldRunRef.current) return;
      reconnectAttemptsRef.current = 0;
      unsubscribeAudioRef.current?.();
      unsubscribeAudioRef.current = audio.subscribePcm16((chunk) => {
        if (socket.readyState !== WebSocket.OPEN) return;
        socket.send(JSON.stringify({ type: "input_audio_buffer.append", audio: encodeBase64(chunk) }));
      });
      setState((current) => ({ ...current, status: "listening", message: "Realtime terhubung. Menunggu ucapan..." }));
      if (pendingKeywordRequestRef.current) schedulePendingKeywordFlush(500);
    });

    socket.addEventListener("message", (event) => {
      if (socketRef.current === socket) handleServerEventRef.current(event.data);
    });

    socket.addEventListener("error", () => {
      if (socketRef.current !== socket) return;
      setState((current) => ({ ...current, status: "connecting", message: "Koneksi realtime terganggu..." }));
    });

    socket.addEventListener("close", () => {
      if (socketRef.current !== socket) return;
      socketRef.current = null;
      unsubscribeAudioRef.current?.();
      unsubscribeAudioRef.current = null;
      if (!shouldRunRef.current) return;

      if (activeHelpRealtimeResponseRef.current) {
        activeHelpFinalRef.current = false;
        updateHelpState((current) => ({
          ...current,
          mode: "response",
          activeResponse: buildNotice("Koneksi Terputus", "Bantuan dihentikan agar respons lama tidak tercampur setelah reconnect.")
        }));
      }
      activeHelpRealtimeResponseRef.current = null;
      activeKeywordResponseRef.current = null;
      queuedHelpRequestRef.current = null;
      responseSlotStateRef.current = "idle";
      realtimeRateLimitUntilRef.current = 0;
      helpResponseBufferRef.current = "";
      keywordResponseBufferRef.current = "";
      ignoredUnclaimedResponseCreatesRef.current = 0;

      const attemptReconnect = async () => {
        reconnectTimerRef.current = null;
        if (!shouldRunRef.current) return;
        try {
          let nextSecret = secretRef.current;
          if (!nextSecret || nextSecret.expiresAt * 1000 <= Date.now() + 10_000) {
            const sessionId = liveMeetingSessionIdRef.current;
            if (!sessionId) throw new Error("Sesi meeting realtime tidak tersedia.");
            nextSecret = await createRealtimeClientSecret(sessionId);
            secretRef.current = nextSecret;
          }
          connectRef.current(nextSecret);
        } catch (error) {
          setState((current) => ({
            ...current,
            status: "connecting",
            message: `${error instanceof Error ? error.message : "Realtime gagal disambungkan ulang."} Mencoba kembali...`
          }));
          scheduleReconnect();
        }
      };
      const scheduleReconnect = () => {
        if (!shouldRunRef.current) return;
        reconnectAttemptsRef.current += 1;
        const attempt = reconnectAttemptsRef.current;
        setState((current) => ({
          ...current,
          status: "connecting",
          message: `Koneksi terputus. Menyambungkan ulang (percobaan ${attempt})...`
        }));
        reconnectTimerRef.current = window.setTimeout(attemptReconnect, Math.min(10_000, 800 * attempt));
      };
      scheduleReconnect();
    });
  }, [audio, schedulePendingKeywordFlush, updateHelpState]);
  connectRef.current = connect;

  const closeResponse = useCallback(() => {
    helpRequestIdRef.current += 1;
    queuedHelpRequestRef.current = null;
    cancelActiveHelpResponse();
    activeHelpFinalRef.current = false;
    updateHelpState((current) => ({ ...current, mode: "idle", activeResponse: null }));
    if (pendingKeywordRequestRef.current) schedulePendingKeywordFlush(500);
  }, [cancelActiveHelpResponse, schedulePendingKeywordFlush, updateHelpState]);

  const requestHelp = useCallback((action: MeetingHelpAction, triggerText = "") => {
    if (!shouldRunRef.current) {
      updateHelpState((current) => ({ ...current, mode: "response", activeResponse: buildNotice("Realtime Belum Aktif", "Mulai meeting dan pastikan system audio terhubung.") }));
      return;
    }
    const normalizedTrigger = triggerText.trim();
    if (action === "keyword" && !normalizedTrigger) {
      updateHelpState((current) => ({ ...current, mode: "response", activeResponse: buildNotice("Keyword Belum Ada", "Pilih keyword yang tersedia dari konteks terbaru.") }));
      return;
    }

    const requiresConversation = isConversationHelpActionName(action);
    const stableContext = conversationStateRef.current?.getStableConversationSnapshot({ blockPendingSpeech: requiresConversation });
    if (requiresConversation && speechPendingRef.current && !stableContext) {
      const waitingRequestId = helpRequestIdRef.current + 1;
      helpRequestIdRef.current = waitingRequestId;
      updateHelpState((current) => ({ ...current, mode: "loading", activeResponse: { title: "Menunggu Transkrip", kind: "notice", points: ["Ucapan sedang diproses..."] } }));
      window.setTimeout(() => {
        if (helpRequestIdRef.current !== waitingRequestId || !shouldRunRef.current) return;
        const completedContext = conversationStateRef.current?.getStableConversationSnapshot({ blockPendingSpeech: true });
        if (completedContext) {
          requestHelp(action, triggerText);
          return;
        }
        updateHelpState((current) => ({ ...current, mode: "response", activeResponse: buildNotice("Konteks Belum Siap", "Transkrip ucapan belum selesai. Coba lagi setelah konteks terbaru muncul.") }));
      }, 1_500);
      return;
    }
    if (requiresConversation && !stableContext) {
      updateHelpState((current) => ({ ...current, mode: "response", activeResponse: buildNotice("Konteks Belum Tertangkap", "Tunggu transkrip terbaru muncul, lalu kirim bantuan lagi.") }));
      return;
    }

    if (activeHelpFinalRef.current && activeDisplayedHelpResponseRef.current?.kind === "help") {
      const previous = activeDisplayedHelpResponseRef.current;
      updateHelpState((current) => ({ ...current, recentHelp: [previous, ...current.recentHelp].slice(0, 5) }));
    }
    activeHelpFinalRef.current = false;
    const title = getRealtimeActionTitle({ action, triggerText: normalizedTrigger });
    updateHelpState((current) => ({
      ...current,
      mode: "loading",
      activeResponse: { title, kind: "help", points: ["Menyiapkan bantuan realtime..."] }
    }));

    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      updateHelpState((current) => ({ ...current, mode: "response", activeResponse: buildNotice("Realtime Belum Aktif", "Koneksi realtime belum siap. Tunggu reconnect selesai lalu coba lagi.") }));
      return;
    }

    const requestId = helpRequestIdRef.current + 1;
    helpRequestIdRef.current = requestId;
    const conversationMode = action === "explain_text"
      ? undefined
      : getExplicitActionConversationMode(action) || "unknown";
    const latestTranscript = stableContext?.focus || latestTranscriptRef.current.trim();
    const recentTranscript = compactRecentTranscript(
      stableContext?.windowText || conversationStateRef.current?.getRecentTranscriptText() || "",
      realtimeHelpTranscriptMaxChars
    );
    const payload: RealtimeActionPromptPayload = {
      action,
      latestQuestion: latestTranscript,
      recentTranscript,
      triggerText: normalizedTrigger || undefined,
      conversationMode
    };
    const queuedRequest: QueuedHelpRequest = {
      requestId,
      title,
      action,
      conversationMode,
      sourceText: [recentTranscript, latestTranscript, normalizedTrigger].filter(Boolean).join("\n"),
      payload,
      retryCount: 0,
      nonCompletedRetryCount: 0,
      rateLimitRetryCount: 0,
      settleUntil: Date.now() + getRealtimeSettleDelay()
    };
    cancelActiveKeywordResponse();
    cancelActiveHelpResponse();
    queueHelpRequest(queuedRequest);
  }, [cancelActiveHelpResponse, cancelActiveKeywordResponse, queueHelpRequest, updateHelpState]);

  const stop = useCallback(async () => {
    shouldRunRef.current = false;
    closeTransport();
    const liveMeetingSessionId = liveMeetingSessionIdRef.current;
    liveMeetingSessionIdRef.current = "";
    secretRef.current = null;
    let endError = "";
    if (liveMeetingSessionId) {
      try {
        await endLiveMeeting(liveMeetingSessionId, conversationStateRef.current?.getFullTranscriptText() || "");
      } catch (error) {
        endError = error instanceof Error ? error.message : "Sesi meeting gagal diakhiri.";
      }
    }
    conversationStateRef.current?.reset();
    latestTranscriptRef.current = "";
    speechPendingRef.current = false;
    speechStartedAtRef.current = 0;
    realtimeContextRef.current = undefined;
    pendingKeywordRequestRef.current = null;
    keywordLastRequestedKeyRef.current = "";
    activeHelpRealtimeResponseRef.current = null;
    activeKeywordResponseRef.current = null;
    helpResponseBufferRef.current = "";
    keywordResponseBufferRef.current = "";
    ignoredResponseIdsRef.current.clear();
    ignoredUnclaimedResponseCreatesRef.current = 0;
    queuedHelpRequestRef.current = null;
    responseSlotStateRef.current = "idle";
    realtimeRateLimitUntilRef.current = 0;
    clearResponseSlotFallbackTimer();
    activeDisplayedHelpResponseRef.current = null;
    activeHelpFinalRef.current = false;
    setState(endError ? { ...initialState, status: "error", message: `${endError} Akhiri sesi dari Riwayat Sesi Live.` } : initialState);
    setHelpState(initialHelpState);
  }, [closeTransport]);

  const start = useCallback(async (meetingContextId: string) => {
    await stop();
    shouldRunRef.current = true;
    setState({ ...initialState, status: "connecting", message: "Menyiapkan sesi realtime..." });
    setHelpState(initialHelpState);

    try {
      const meeting = await startLiveMeeting(meetingContextId);
      liveMeetingSessionIdRef.current = meeting.liveMeetingSession.id;
      realtimeContextRef.current = meeting.realtimeContext;
      const secret = await createRealtimeClientSecret(meeting.liveMeetingSession.id);
      if (secret.model !== "gpt-realtime-mini" || !secret.clientSecret || !secret.expiresAt) {
        throw new Error("Realtime client secret dari backend tidak valid.");
      }
      if (!shouldRunRef.current) return false;
      secretRef.current = secret;
      connect(secret);
      return true;
    } catch (error) {
      shouldRunRef.current = false;
      const liveMeetingSessionId = liveMeetingSessionIdRef.current;
      liveMeetingSessionIdRef.current = "";
      let cleanupError = "";
      if (liveMeetingSessionId) {
        try {
          await endLiveMeeting(liveMeetingSessionId, "");
        } catch (caught) {
          cleanupError = caught instanceof Error ? caught.message : "cleanup sesi gagal";
        }
      }
      realtimeContextRef.current = undefined;
      setState({
        ...initialState,
        status: "error",
        message: `${error instanceof Error ? error.message : "Sesi realtime gagal dimulai."}${cleanupError ? ` Sesi mungkin masih aktif (${cleanupError}); gunakan Riwayat Sesi Live untuk mengakhirinya.` : ""}`
      });
      return false;
    }
  }, [connect, stop]);

  useEffect(() => () => {
    shouldRunRef.current = false;
    closeTransport();
    const sessionId = liveMeetingSessionIdRef.current;
    if (sessionId) {
      // Unload cannot await network completion. Any failed cleanup remains recoverable from session history.
      void endLiveMeeting(sessionId, conversationStateRef.current?.getFullTranscriptText() || "").catch(() => undefined);
    }
  }, [closeTransport]);

  const helpEnabled = shouldRunRef.current
    && helpState.mode !== "loading"
    && (state.status === "listening" || state.status === "transcribing");

  return {
    ...state,
    active: shouldRunRef.current && state.status !== "error",
    start,
    stop,
    help: {
      ...helpState,
      enabled: helpEnabled,
      requestHelp,
      closeResponse
    } satisfies MeetingHelpController
  };
}

function buildNotice(title: string, message: string): MeetingHelpResponse {
  return { title, kind: "notice", points: [message] };
}

function normalizeTranscript(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function isActiveResponseInProgressError(message: string) {
  return /active response in progress/i.test(message)
    || /wait until the response is finished/i.test(message);
}

function isRetryableRealtimeDoneState(state: ReturnType<typeof getRealtimeResponseDoneState>) {
  if (state.status === "cancelled") return true;
  if (state.status === "unknown") return true;
  return state.status === "incomplete" && !/content_filter/i.test(state.reason);
}

function getRealtimeDoneNoticeMessage(state: ReturnType<typeof getRealtimeResponseDoneState>) {
  if (state.status === "failed") {
    return state.errorMessage || state.errorCode || "Realtime gagal membuat bantuan.";
  }
  if (state.status === "incomplete") {
    if (/content_filter/i.test(state.reason)) return "Realtime menghentikan bantuan karena filter konten.";
    if (/max_output_tokens/i.test(state.reason)) return "Realtime menghentikan bantuan karena batas token tercapai. Coba kirim ulang bantuan.";
    return "Realtime belum menyelesaikan bantuan. Coba kirim ulang setelah konteks stabil.";
  }
  if (state.status === "cancelled") {
    return "Realtime membatalkan bantuan karena giliran bicara/audio masih berubah. Coba kirim ulang setelah konteks stabil.";
  }
  return "Realtime belum memberi status selesai yang valid. Coba kirim ulang bantuan.";
}

function compactRealtimePromptPayload(payload: RealtimeActionPromptPayload): RealtimeActionPromptPayload {
  const isKeywordPrompt = payload.action === "surface_keywords";
  return {
    ...payload,
    latestQuestion: compactText(payload.latestQuestion || "", realtimeFocusMaxChars),
    recentTranscript: compactRecentTranscript(
      payload.recentTranscript || "",
      isKeywordPrompt ? realtimeKeywordTranscriptMaxChars : realtimeHelpTranscriptMaxChars
    ),
    triggerText: compactText(payload.triggerText || "", realtimeTriggerMaxChars)
  };
}

function compactRecentTranscript(value: string, maxCharacters: number) {
  const lines = value
    .split(/\r?\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(-4);
  const joined = lines.join("\n").trim();
  if (joined.length <= maxCharacters) return joined;
  return joined.slice(joined.length - maxCharacters).trim();
}

function compactText(value: string, maxCharacters: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxCharacters) return normalized;
  return normalized.slice(0, maxCharacters).trim();
}

function buildKeywordRequestFingerprint(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim().toLowerCase();
  return normalized.length <= 360 ? normalized : normalized.slice(normalized.length - 360);
}

function formatDelaySeconds(delayMs: number) {
  return `${Math.max(1, Math.ceil(delayMs / 1_000))} detik`;
}

function encodeBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index] ?? 0);
  return btoa(binary);
}
