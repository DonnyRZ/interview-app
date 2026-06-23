import {
  buildRealtimeActionPrompt,
  buildRealtimeCancelEvent,
  extractRealtimeResponseText,
  formatRealtimeResponsePoints,
  getExplicitActionConversationMode,
  getRealtimeActionTitle,
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
};

type ActiveKeywordResponse = {
  requestId: number;
  generation: number;
  responseId?: string;
};

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
  const activeDisplayedHelpResponseRef = useRef<MeetingHelpResponse | null>(null);
  const activeHelpFinalRef = useRef(false);
  const pendingKeywordTranscriptRef = useRef("");
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

  const cancelActiveHelpResponse = useCallback(() => {
    const responseId = activeHelpRealtimeResponseRef.current?.responseId;
    if (responseId) ignoredResponseIdsRef.current.add(responseId);
    const cancelEvent = buildRealtimeCancelEvent(responseId);
    if (cancelEvent) sendClientEvent(cancelEvent);
    activeHelpRealtimeResponseRef.current = null;
    helpResponseBufferRef.current = "";
  }, [sendClientEvent]);

  const cancelActiveKeywordResponse = useCallback(() => {
    keywordGenerationRef.current += 1;
    const activeKeyword = activeKeywordResponseRef.current;
    const responseId = activeKeyword?.responseId;
    if (responseId) ignoredResponseIdsRef.current.add(responseId);
    else if (activeKeyword) ignoredUnclaimedResponseCreatesRef.current += 1;
    const cancelEvent = buildRealtimeCancelEvent(responseId);
    if (cancelEvent) sendClientEvent(cancelEvent);
    activeKeywordResponseRef.current = null;
    keywordResponseBufferRef.current = "";
  }, [sendClientEvent]);

  const clearRuntimeTimers = useCallback(() => {
    if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
    if (keywordTimerRef.current !== null) window.clearTimeout(keywordTimerRef.current);
    keywordTimerRef.current = null;
  }, []);

  const closeTransport = useCallback(() => {
    clearRuntimeTimers();
    cancelActiveHelpResponse();
    cancelActiveKeywordResponse();
    unsubscribeAudioRef.current?.();
    unsubscribeAudioRef.current = null;
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
  }, [cancelActiveHelpResponse, cancelActiveKeywordResponse, clearRuntimeTimers]);

  const sendResponseRequest = useCallback((payload: RealtimeActionPromptPayload, maxOutputTokens: number) => {
    const itemSent = sendClientEvent({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: buildRealtimeActionPrompt(payload) }]
      }
    });
    const responseSent = sendClientEvent({
      type: "response.create",
      response: { output_modalities: ["text"], max_output_tokens: maxOutputTokens }
    });
    return itemSent && responseSent;
  }, [sendClientEvent]);

  const flushPendingKeywords = useCallback(() => {
    if (activeHelpRealtimeResponseRef.current || activeKeywordResponseRef.current || !pendingKeywordTranscriptRef.current) return;
    const transcript = pendingKeywordTranscriptRef.current;
    pendingKeywordTranscriptRef.current = "";
    const requestId = keywordRequestIdRef.current + 1;
    keywordRequestIdRef.current = requestId;
    const generation = keywordGenerationRef.current;
    activeKeywordResponseRef.current = { requestId, generation };
    keywordResponseBufferRef.current = "";
    const sent = sendResponseRequest({
      action: "surface_keywords",
      latestQuestion: latestTranscriptRef.current,
      recentTranscript: transcript,
      conversationMode: "unknown"
    }, 80);
    if (!sent) {
      activeKeywordResponseRef.current = null;
      pendingKeywordTranscriptRef.current = transcript;
    }
  }, [sendResponseRequest]);

  const scheduleKeywordRefresh = useCallback((transcript: string, delay = 700) => {
    if (!transcript.trim()) return;
    pendingKeywordTranscriptRef.current = transcript.trim();
    if (keywordTimerRef.current !== null) window.clearTimeout(keywordTimerRef.current);
    keywordTimerRef.current = window.setTimeout(() => {
      keywordTimerRef.current = null;
      flushPendingKeywords();
    }, delay);
  }, [flushPendingKeywords]);

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
      isCurrentHelpRequest,
      true
    );
  }

  function isActiveKeywordResponseEvent(responseId: string) {
    const active = activeKeywordResponseRef.current;
    if (!active || active.generation !== keywordGenerationRef.current) return false;
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
    if (!responseId) return;
    if (ignoredUnclaimedResponseCreatesRef.current > 0) {
      ignoredUnclaimedResponseCreatesRef.current -= 1;
      ignoredResponseIdsRef.current.add(responseId);
      return;
    }
    const help = activeHelpRealtimeResponseRef.current;
    if (
      help
      && isCurrentHelpRequest(help.requestId)
      && !hasRealtimeResponseIdConflict(help, activeKeywordResponseRef.current, responseId)
      && canClaimRealtimeResponseId(help, activeKeywordResponseRef.current, responseId, true)
    ) {
      activeHelpRealtimeResponseRef.current = { ...help, responseId };
      return;
    }

    const keyword = activeKeywordResponseRef.current;
    if (
      keyword
      && keyword.generation === keywordGenerationRef.current
      && canClaimRealtimeResponseId(keyword, activeHelpRealtimeResponseRef.current, responseId, canKeywordUseMissingResponseIdFallback())
    ) {
      activeKeywordResponseRef.current = { ...keyword, responseId };
    }
  }

  const finalizeKeywordResponse = useCallback((event: Record<string, unknown>, responseId: string) => {
    const active = activeKeywordResponseRef.current;
    if (!active) return;
    if (!isActiveKeywordResponseEvent(responseId)) return;
    const finalText = extractRealtimeResponseText(event) || keywordResponseBufferRef.current.trim();
    activeKeywordResponseRef.current = null;
    keywordResponseBufferRef.current = "";
    ignoredUnclaimedResponseCreatesRef.current = 0;
    if (active.generation === keywordGenerationRef.current) {
      const keywords = parseRealtimeKeywords(finalText);
      updateHelpState((current) => ({ ...current, keywords }));
    }
    if (pendingKeywordTranscriptRef.current) scheduleKeywordRefresh(pendingKeywordTranscriptRef.current, 500);
  }, [scheduleKeywordRefresh, updateHelpState]);

  const finalizeHelpResponse = useCallback((event: Record<string, unknown>, responseId: string) => {
    const active = activeHelpRealtimeResponseRef.current;
    if (!active || !isActiveHelpResponseEvent(responseId)) return;
    const finalText = extractRealtimeResponseText(event) || helpResponseBufferRef.current.trim();
    activeHelpRealtimeResponseRef.current = null;
    helpResponseBufferRef.current = "";

    if (!finalText.trim() && active.payload && (active.retryCount || 0) < 1) {
      const retry = { ...active, responseId: undefined, retryCount: (active.retryCount || 0) + 1 };
      activeHelpRealtimeResponseRef.current = retry;
      updateHelpState((current) => ({
        ...current,
        mode: "loading",
        activeResponse: current.activeResponse
          ? { ...current.activeResponse, points: ["Mencoba ulang bantuan realtime..."] }
          : current.activeResponse
      }));
      if (sendResponseRequest(active.payload, 500)) return;
      activeHelpRealtimeResponseRef.current = null;
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
    if (pendingKeywordTranscriptRef.current) scheduleKeywordRefresh(pendingKeywordTranscriptRef.current, 500);
  }, [scheduleKeywordRefresh, sendResponseRequest, updateHelpState]);

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
      if (type === "response.done") ignoredResponseIdsRef.current.delete(responseId);
      return;
    }
    if (type === "response.created") {
      claimCreatedResponse(responseId);
      return;
    }
    if (type === "input_audio_buffer.speech_started") {
      speechPendingRef.current = true;
      speechStartedAtRef.current = Date.now();
      conversationStateRef.current?.markSpeechStarted(speechStartedAtRef.current);
      setState((current) => ({ ...current, status: "transcribing", message: "Ucapan terdeteksi...", interimTranscript: "" }));
      return;
    }
    if (type === "input_audio_buffer.speech_stopped") {
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
        keywordResponseBufferRef.current += event.delta;
        return;
      }
      if (!isActiveHelpResponseEvent(responseId)) return;
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
        if (!keywordResponseBufferRef.current.trim()) keywordResponseBufferRef.current = event.text;
        return;
      }
      if (!isActiveHelpResponseEvent(responseId)) return;
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
      if (activeKeywordResponseRef.current && !activeHelpRealtimeResponseRef.current) {
        activeKeywordResponseRef.current = null;
        keywordResponseBufferRef.current = "";
        if (pendingKeywordTranscriptRef.current) scheduleKeywordRefresh(pendingKeywordTranscriptRef.current, 1_000);
        return;
      }
      if (activeHelpRealtimeResponseRef.current) {
        activeHelpRealtimeResponseRef.current = null;
        helpResponseBufferRef.current = "";
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
      if (pendingKeywordTranscriptRef.current) scheduleKeywordRefresh(pendingKeywordTranscriptRef.current, 500);
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
  }, [audio, scheduleKeywordRefresh, updateHelpState]);
  connectRef.current = connect;

  const closeResponse = useCallback(() => {
    helpRequestIdRef.current += 1;
    cancelActiveHelpResponse();
    activeHelpFinalRef.current = false;
    updateHelpState((current) => ({ ...current, mode: "idle", activeResponse: null }));
    if (pendingKeywordTranscriptRef.current) scheduleKeywordRefresh(pendingKeywordTranscriptRef.current, 500);
  }, [cancelActiveHelpResponse, scheduleKeywordRefresh, updateHelpState]);

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
    cancelActiveKeywordResponse();
    cancelActiveHelpResponse();
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
    const recentTranscript = stableContext?.windowText || conversationStateRef.current?.getRecentTranscriptText() || "";
    const payload: RealtimeActionPromptPayload = {
      action,
      latestQuestion: latestTranscript,
      recentTranscript,
      triggerText: normalizedTrigger || undefined,
      conversationMode
    };
    activeHelpRealtimeResponseRef.current = {
      requestId,
      action,
      conversationMode,
      sourceText: [recentTranscript, latestTranscript, normalizedTrigger].filter(Boolean).join("\n"),
      payload,
      retryCount: 0
    };
    helpResponseBufferRef.current = "";
    const sent = sendResponseRequest(payload, 500);
    if (!sent) {
      activeHelpRealtimeResponseRef.current = null;
      updateHelpState((current) => ({ ...current, mode: "response", activeResponse: buildNotice("Realtime Belum Aktif", "Bantuan tidak terkirim karena koneksi realtime tertutup.") }));
    }
  }, [cancelActiveHelpResponse, cancelActiveKeywordResponse, sendResponseRequest, updateHelpState]);

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
    pendingKeywordTranscriptRef.current = "";
    ignoredResponseIdsRef.current.clear();
    ignoredUnclaimedResponseCreatesRef.current = 0;
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

function encodeBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index] ?? 0);
  return btoa(binary);
}
