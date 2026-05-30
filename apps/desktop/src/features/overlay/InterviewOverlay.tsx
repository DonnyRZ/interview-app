import { FormEvent, PointerEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RealtimeContext } from "@interview-app/shared";
import {
  buildNoFreshContextResponse,
  buildNoKeywordResponse,
  buildRealtimeUnavailableResponse,
  extractRealtimeResponseText,
  formatRealtimeResponsePoints,
  getRuntimeKeywordMessage,
  type HelpResponse,
  type RuntimeKeywordStatus
} from "./runtime-rules/overlay-response-copy.js";
import { buildRealtimeActionPrompt } from "./runtime-rules/realtime-action-prompt.js";
import {
  getExplicitActionConversationMode,
  isConversationHelpActionName
} from "./runtime-rules/realtime-action-types.js";
import {
  areSameTranscript,
  buildConversationWindow,
  buildKeywordSourceText,
  chooseMostCompleteTranscript,
  classifyMeetingConversationMode,
  classifyTranscriptQuality,
  deriveLatestConversationFocus,
  isDomainRelatedText,
  looksLikeMeetingQuestion,
  type ConversationMode,
  type TranscriptQualityResult
} from "./runtime-rules/transcript-focus-rules.js";

type OverlayMode = "mini" | "expanded" | "loading" | "response";

type OverlayContext = {
  liveMeetingSessionId?: string;
  meetingContextId?: string;
  contextName?: string;
  meetingTopic?: string;
  sessionType?: string;
  audioStatus?: string;
  audioDeviceLabel?: string;
  audioSourceKind?: string;
  domainLabel?: string;
  runtimeKeywords?: string[];
  latestQuestion?: string;
  latestTranscriptEvent?: OverlayTranscriptEvent;
  realtimeContext?: RealtimeContext;
  realtimeStatus?: string;
  realtimeMessage?: string;
};

type ConversationTurn = {
  itemId: string;
  previousItemId?: string;
  speaker: "interviewer";
  text: string;
  capturedAt: string;
  sequence: number;
};

type StableConversationSnapshot = {
  focus: string;
  windowText: string;
  capturedAt: string;
  sourceVersion: number;
  conversationMode: ConversationMode;
};

type RuntimeKeywordRequestPayload = {
  requestKey: string;
  fingerprint: string;
  generation: number;
  transcriptSegment: string;
};

type RejectedTranscriptMetadata = {
  source: "realtime" | "dev";
  reason: string;
  status: TranscriptQualityResult["status"];
  capturedAt: string;
  sample: string;
};

type ActiveRealtimeResponse = {
  requestId: number;
  action: RealtimeOverlayAction["action"];
  conversationMode?: RealtimeOverlayAction["conversationMode"];
  sourceText?: string;
  payload?: RealtimeOverlayAction;
  retryCount?: number;
  responseId?: string;
};

type ActiveKeywordRealtimeResponse = {
  requestKey: string;
  fingerprint: string;
  generation: number;
  responseId?: string;
};

const waitingFocusText = "Menunggu konteks percakapan meeting.";
const conversationMemoryMs = 120_000;
const runtimeKeywordThrottleMs = 350;

const fallbackContext: OverlayContext = {
  contextName: "Meeting",
  meetingTopic: "Active session",
  sessionType: "HR",
  domainLabel: "meeting context",
  runtimeKeywords: []
};

export function InterviewOverlay() {
  const [context, setContext] = useState<OverlayContext>(fallbackContext);
  const [mode, setMode] = useState<OverlayMode>("mini");
  const [seconds, setSeconds] = useState(0);
  const [recentHelp, setRecentHelp] = useState<HelpResponse[]>([]);
  const [activeResponse, setActiveResponse] = useState<HelpResponse | null>(null);
  const [latestFocus, setLatestFocus] = useState(waitingFocusText);
  const [stableConversationVersion, setStableConversationVersion] = useState(0);
  const [keywordTranscriptVersion, setKeywordTranscriptVersion] = useState(0);
  const [runtimeKeywordStatus, setRuntimeKeywordStatus] = useState<RuntimeKeywordStatus>("idle");
  const contextRef = useRef<OverlayContext>(fallbackContext);
  const activeRequestRef = useRef(0);
  const activeRealtimeResponseRef = useRef<ActiveRealtimeResponse | null>(null);
  const activeKeywordResponseRef = useRef<ActiveKeywordRealtimeResponse | null>(null);
  const activeResponseFinalRef = useRef(false);
  const runtimeKeywordRequestRef = useRef("");
  const runtimeKeywordTimerRef = useRef<number | null>(null);
  const runtimeKeywordInFlightRef = useRef(false);
  const runtimeKeywordPendingRef = useRef<RuntimeKeywordRequestPayload | null>(null);
  const runtimeKeywordLastRequestedKeyRef = useRef("");
  const runtimeKeywordGenerationRef = useRef(0);
  const streamingResponseRef = useRef("");
  const keywordStreamingResponseRef = useRef("");
  const realtimeSocketRef = useRef<WebSocket | null>(null);
  const realtimeStatusRef = useRef("");
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

  function applyContext(payload: unknown) {
    if (!payload || typeof payload !== "object") return;

    const nextContext = payload as OverlayContext;
    const incomingRoundId = typeof nextContext.liveMeetingSessionId === "string" ? nextContext.liveMeetingSessionId : undefined;
    const currentRoundId = typeof contextRef.current.liveMeetingSessionId === "string" ? contextRef.current.liveMeetingSessionId : undefined;
    const isNewRound = Boolean(incomingRoundId) && incomingRoundId !== currentRoundId;
    const mergedContext = {
      ...(isNewRound ? fallbackContext : contextRef.current),
      ...nextContext
    };
    if (!Object.prototype.hasOwnProperty.call(nextContext, "latestTranscriptEvent")) {
      delete mergedContext.latestTranscriptEvent;
    }

    contextRef.current = mergedContext;
    setContext(mergedContext);

    if (nextContext.latestTranscriptEvent) {
      registerTranscriptEvent(nextContext.latestTranscriptEvent);
    }

    if (isNewRound) {
      activeRequestRef.current += 1;
      cancelActiveRealtimeResponse();
      activeResponseFinalRef.current = false;
      clearRuntimeKeywordRequests();
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
      setActiveResponse(null);
      setRecentHelp([]);
      setSeconds(0);
      setLatestFocus(waitingFocusText);
      setStableConversationVersion(0);
      setKeywordTranscriptVersion(0);
      setRuntimeKeywordStatus("idle");
      setMode("mini");
    }
  }

  useLayoutEffect(() => {
    document.documentElement.classList.add("overlay-window-document");
    document.body.classList.add("overlay-window-body");

    return () => {
      document.documentElement.classList.remove("overlay-window-document");
      document.body.classList.remove("overlay-window-body");
    };
  }, []);

  useEffect(() => {
    void window.interviewDesktop?.getOverlayContext?.().then(applyContext);
    void window.interviewDesktop?.reportRealtimeClientEvent?.({ type: "ready" });
    return window.interviewDesktop?.onOverlayContextUpdated?.(applyContext);
  }, []);

  useEffect(() => {
    return window.interviewDesktop?.onRealtimeOverlayEvent?.((event) => {
      if (event.type === "status") {
        const nextStatus = typeof event.status === "string" ? event.status : "";
        const nextMessage = typeof event.message === "string" ? event.message : "";
        realtimeStatusRef.current = nextStatus;
        setContext((current) => {
          const nextContext = {
            ...current,
            realtimeStatus: nextStatus,
            realtimeMessage: nextMessage
          };
          contextRef.current = nextContext;
          return nextContext;
        });
        return;
      }

      if (event.type === "audio_status") {
        const nextStatus = typeof event.status === "string" ? event.status : "";
        const nextMessage = typeof event.message === "string" ? event.message : "";
        const deviceLabel = typeof event.deviceLabel === "string" ? event.deviceLabel : undefined;
        setContext((current) => {
          const nextContext = {
            ...current,
            audioStatus: nextStatus,
            audioDeviceLabel: deviceLabel || current.audioDeviceLabel,
            audioSourceKind: "system-loopback",
            realtimeMessage: nextMessage || current.realtimeMessage
          };
          contextRef.current = nextContext;
          return nextContext;
        });
        return;
      }

      if (event.type === "connect") {
        connectRealtimeClient(event);
        return;
      }

      if (event.type === "disconnect") {
        closeRealtimeClient();
        return;
      }

      if (event.type === "input_audio_buffer.append") {
        const audio = typeof event.audio === "string" ? event.audio : "";
        if (audio) {
          sendRealtimeClientEvent({
            type: "input_audio_buffer.append",
            audio
          });
        }
        return;
      }

      if (event.type === "client_action") {
        const payload = event.payload && typeof event.payload === "object"
          ? event.payload as RealtimeOverlayAction
          : null;
        if (payload) {
          void sendRealtimeActionToSocket(payload);
        }
        return;
      }

      if (event.type === "response_started") {
        const requestId = typeof event.requestId === "number" ? event.requestId : 0;
        if (!isCurrentRequest(requestId)) return;
        streamingResponseRef.current = "";
        setActiveResponse({
          title: typeof event.title === "string" ? event.title : "Meeting Help",
          kind: "help",
          points: ["Menyiapkan bantuan realtime..."]
        });
        setMode("response");
        return;
      }

      if (event.type === "response_delta") {
        const requestId = typeof event.requestId === "number" ? event.requestId : 0;
        const delta = typeof event.delta === "string" ? event.delta : "";
        if (!isCurrentRequest(requestId)) return;
        streamingResponseRef.current += delta;
        const points = formatRealtimeResponsePoints(streamingResponseRef.current, {
          action: activeRealtimeResponseRef.current?.action,
          conversationMode: activeRealtimeResponseRef.current?.conversationMode,
          sourceText: activeRealtimeResponseRef.current?.sourceText
        });
        setActiveResponse((current) => current
          ? { ...current, points: points.length ? points : ["Menyiapkan bantuan realtime..."] }
          : current);
        setMode("response");
        return;
      }

      if (event.type === "response_done") {
        const requestId = typeof event.requestId === "number" ? event.requestId : 0;
        const doneText = typeof event.text === "string" ? event.text.trim() : "";
        if (!isCurrentRequest(requestId)) return;
        const finalText = doneText || streamingResponseRef.current.trim();
        setActiveResponse((current) => current
          ? { ...current, points: formatRealtimeResponsePoints(finalText, {
            action: activeRealtimeResponseRef.current?.action,
            conversationMode: activeRealtimeResponseRef.current?.conversationMode,
            sourceText: activeRealtimeResponseRef.current?.sourceText
          }) }
          : {
            title: "Meeting Help",
            kind: "help",
            points: formatRealtimeResponsePoints(finalText, {
              action: activeRealtimeResponseRef.current?.action,
              conversationMode: activeRealtimeResponseRef.current?.conversationMode,
              sourceText: activeRealtimeResponseRef.current?.sourceText
            })
          });
        streamingResponseRef.current = "";
        setMode("response");
        return;
      }

      if (event.type === "error") {
        const requestId = typeof event.requestId === "number" ? event.requestId : 0;
        const message = typeof event.message === "string" ? event.message : undefined;
        if (requestId && !isCurrentRequest(requestId)) return;
        setActiveResponse(buildRealtimeUnavailableResponse(message));
        streamingResponseRef.current = "";
        setMode("response");
      }
    });
  }, []);

  useEffect(() => {
    return () => closeRealtimeClient(false);
  }, []);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setSeconds((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    const resizeMode = mode === "mini" ? "mini" : mode === "response" || mode === "loading" ? "response" : "expanded";
    void window.interviewDesktop?.resizeOverlay?.(resizeMode);
  }, [mode]);

  useEffect(() => {
    const stopDrag = () => {
      void window.interviewDesktop?.stopOverlayDrag?.();
    };

    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("blur", stopDrag);
    return () => {
      window.removeEventListener("pointerup", stopDrag);
      window.removeEventListener("blur", stopDrag);
      stopDrag();
    };
  }, []);

  useEffect(() => {
    const snapshot = getKeywordConversationSnapshot({ maxAgeMs: conversationMemoryMs });
    if (!context.realtimeContext || !snapshot || !isRealtimeLive(context)) {
      if (context.runtimeKeywords?.length) {
        syncRuntimeKeywords([]);
      }
      clearRuntimeKeywordRequests();
      setRuntimeKeywordStatus("idle");
      return;
    }

    queueRuntimeKeywordRequest(snapshot);
  }, [context.liveMeetingSessionId, context.realtimeContext, context.realtimeStatus, stableConversationVersion, keywordTranscriptVersion]);

  function beginDrag(event: PointerEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("button, input, textarea, select, a")) return;
    void window.interviewDesktop?.startOverlayDrag?.({
      screenX: event.screenX,
      screenY: event.screenY
    });
  }

  function toggleExpanded() {
    setMode((current) => {
      if (current === "mini") {
        return "expanded";
      }

      activeRequestRef.current += 1;
      cancelActiveRealtimeResponse();
      activeResponseFinalRef.current = false;
      return "mini";
    });
  }

  function closeResponse() {
    activeRequestRef.current += 1;
    cancelActiveRealtimeResponse();
    activeResponseFinalRef.current = false;
    setActiveResponse(null);
    setMode("expanded");
  }

  function syncRuntimeKeywords(nextKeywords: string[]) {
    setContext((current) => {
      const currentKeywords = current.runtimeKeywords || [];
      if (sameKeywordTerms(currentKeywords, nextKeywords)) {
        return current;
      }

      const nextContext = {
        ...current,
        runtimeKeywords: nextKeywords
      };
      contextRef.current = nextContext;
      void window.interviewDesktop?.updateOverlayContext?.({
        runtimeKeywords: nextKeywords
      });
      return nextContext;
    });
  }

  function clearRuntimeKeywordRequests() {
    cancelActiveKeywordResponse();

    if (runtimeKeywordTimerRef.current) {
      window.clearTimeout(runtimeKeywordTimerRef.current);
      runtimeKeywordTimerRef.current = null;
    }

    runtimeKeywordPendingRef.current = null;
    runtimeKeywordInFlightRef.current = false;
    runtimeKeywordRequestRef.current = "";
    runtimeKeywordLastRequestedKeyRef.current = "";
    runtimeKeywordGenerationRef.current += 1;
    activeKeywordResponseRef.current = null;
    keywordStreamingResponseRef.current = "";
  }

  function queueRuntimeKeywordRequest(snapshot: StableConversationSnapshot) {
    const keywordSourceText = buildKeywordSourceText(snapshot.focus, snapshot.windowText);
    if (!keywordSourceText.trim()) {
      setRuntimeKeywordStatus(contextRef.current.runtimeKeywords?.length ? "ready" : "empty");
      return;
    }

    const fingerprint = buildKeywordRequestFingerprint(keywordSourceText);
    const requestKey = `${contextRef.current.liveMeetingSessionId || "draft"}::${fingerprint}`;
    if (
      runtimeKeywordLastRequestedKeyRef.current === requestKey
      || runtimeKeywordPendingRef.current?.requestKey === requestKey
    ) {
      return;
    }

    runtimeKeywordPendingRef.current = {
      requestKey,
      fingerprint,
      generation: runtimeKeywordGenerationRef.current,
      transcriptSegment: keywordSourceText
    };
    runtimeKeywordRequestRef.current = requestKey;
    syncRuntimeKeywords([]);
    setRuntimeKeywordStatus("loading");

    scheduleRuntimeKeywordFlush();
  }

  function scheduleRuntimeKeywordFlush(delayMs = runtimeKeywordThrottleMs) {
    if (runtimeKeywordInFlightRef.current || runtimeKeywordTimerRef.current) {
      return;
    }

    runtimeKeywordTimerRef.current = window.setTimeout(() => {
      runtimeKeywordTimerRef.current = null;
      void flushRuntimeKeywordRequest();
    }, delayMs);
  }

  function getPendingRuntimeKeywordRequest() {
    return runtimeKeywordPendingRef.current;
  }

  async function flushRuntimeKeywordRequest() {
    if (runtimeKeywordInFlightRef.current) {
      return;
    }

    const payload = runtimeKeywordPendingRef.current;
    if (!payload) {
      return;
    }

    runtimeKeywordPendingRef.current = null;
    runtimeKeywordInFlightRef.current = true;
    runtimeKeywordLastRequestedKeyRef.current = payload.requestKey;
    const generation = payload.generation;

    if (activeRealtimeResponseRef.current || realtimeStatusRef.current === "responding") {
      runtimeKeywordInFlightRef.current = false;
      scheduleRuntimeKeywordFlush(700);
      return;
    }

    keywordStreamingResponseRef.current = "";
    activeKeywordResponseRef.current = {
      requestKey: payload.requestKey,
      fingerprint: payload.fingerprint,
      generation
    };

    const sent = sendRealtimeKeywordRequest(payload);
    if (!sent) {
      if (runtimeKeywordGenerationRef.current === generation && runtimeKeywordRequestRef.current === payload.requestKey) {
        activeKeywordResponseRef.current = null;
        keywordStreamingResponseRef.current = "";
        runtimeKeywordInFlightRef.current = false;
        setRuntimeKeywordStatus(contextRef.current.runtimeKeywords?.length ? "ready" : "error");
      }
    }
  }

  function isCurrentRequest(requestId: number) {
    return activeRequestRef.current === requestId;
  }

  function updateRealtimeStatus(status: string, message: string) {
    realtimeStatusRef.current = status;
    setContext((current) => {
      const nextContext = {
        ...current,
        realtimeStatus: status,
        realtimeMessage: message
      };
      contextRef.current = nextContext;
      return nextContext;
    });
  }

  function connectRealtimeClient(event: Record<string, unknown>) {
    const model = typeof event.model === "string" ? event.model : "";
    const clientSecret = typeof event.clientSecret === "string" ? event.clientSecret : "";
    if (model !== "gpt-realtime-mini" || !clientSecret) {
      updateRealtimeStatus("error", "Realtime client secret invalid atau bukan gpt-realtime-mini.");
      void window.interviewDesktop?.reportRealtimeClientEvent?.({
        type: "error",
        message: "Realtime client secret invalid atau bukan gpt-realtime-mini."
      });
      return;
    }

    closeRealtimeClient(false);
    updateRealtimeStatus("connecting", "Menghubungkan WebSocket Realtime...");

    const socket = new WebSocket(
      `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`,
      [
        "realtime",
        `openai-insecure-api-key.${clientSecret}`
      ]
    );
    realtimeSocketRef.current = socket;

    socket.addEventListener("open", () => {
      if (realtimeSocketRef.current !== socket) return;
      updateRealtimeStatus("audio_waiting", "Mencari audio meeting dari active system output...");
      void window.interviewDesktop?.reportRealtimeClientEvent?.({ type: "open" });
    });

    socket.addEventListener("message", (messageEvent) => {
      if (realtimeSocketRef.current !== socket) return;
      handleRealtimeServerEvent(messageEvent.data);
    });

    socket.addEventListener("error", () => {
      if (realtimeSocketRef.current !== socket) return;
      updateRealtimeStatus("error", "Realtime WebSocket gagal tersambung.");
      setActiveResponse(buildRealtimeUnavailableResponse("Realtime WebSocket gagal tersambung."));
      setMode("response");
      void window.interviewDesktop?.reportRealtimeClientEvent?.({
        type: "error",
        message: "Realtime WebSocket gagal tersambung."
      });
    });

    socket.addEventListener("close", () => {
      if (realtimeSocketRef.current !== socket) return;
      realtimeSocketRef.current = null;
      if (realtimeStatusRef.current !== "error") {
        updateRealtimeStatus("closed", "Realtime session tertutup.");
        void window.interviewDesktop?.reportRealtimeClientEvent?.({ type: "closed" });
      }
    });
  }

  function closeRealtimeClient(reportClose = true) {
    activeRequestRef.current += 1;
    cancelActiveRealtimeResponse();
    cancelActiveKeywordResponse();
    const socket = realtimeSocketRef.current;
    realtimeSocketRef.current = null;
    if (socket) {
      try {
        socket.close();
      } catch {
        // Browser WebSocket close is best-effort during overlay shutdown.
      }
    }

    if (reportClose) {
      streamingResponseRef.current = "";
      activeResponseFinalRef.current = false;
    }
  }

  function handleRealtimeServerEvent(data: unknown) {
    const text = typeof data === "string" ? data : "";
    if (!text) {
      return;
    }

    let event: Record<string, unknown>;
    try {
      event = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return;
    }

    const type = typeof event.type === "string" ? event.type : "";
    if (type === "response.created") {
      const responseId = getRealtimeResponseId(event);
      const active = activeRealtimeResponseRef.current;
      if (active && isCurrentRequest(active.requestId) && responseId) {
        activeRealtimeResponseRef.current = {
          ...active,
          responseId
        };
        return;
      }

      const activeKeyword = activeKeywordResponseRef.current;
      if (activeKeyword && responseId) {
        activeKeywordResponseRef.current = {
          ...activeKeyword,
          responseId
        };
      }
      return;
    }

    if (type === "input_audio_buffer.speech_started") {
      pendingSpeechRef.current = true;
      currentSpeechStartedAtRef.current = Date.now();
      updateRealtimeStatus("listening", "Menangkap ucapan lawan bicara...");
      return;
    }

    if (type === "input_audio_buffer.speech_stopped") {
      pendingSpeechRef.current = true;
      updateRealtimeStatus("listening", "Ucapan selesai, menunggu transcript...");
      return;
    }

    if (type === "input_audio_buffer.committed") {
      const itemId = typeof event.item_id === "string" ? event.item_id : "";
      const previousItemId = typeof event.previous_item_id === "string" ? event.previous_item_id : undefined;
      if (itemId) {
        ensureTranscriptOrder(itemId, previousItemId);
      }
      return;
    }

    if (type === "conversation.item.input_audio_transcription.delta") {
      const delta = typeof event.delta === "string" ? event.delta : "";
      if (delta) {
        const itemId = typeof event.item_id === "string" && event.item_id.trim()
          ? event.item_id.trim()
          : "interim-audio";
        const previousItemId = typeof event.previous_item_id === "string" ? event.previous_item_id : undefined;
        registerTranscriptDelta({
          itemId,
          previousItemId,
          delta,
          capturedAt: new Date().toISOString()
        });
      }
      return;
    }

    if (type === "conversation.item.input_audio_transcription.completed") {
      const transcriptText = typeof event.transcript === "string" ? event.transcript.trim() : "";
      if (transcriptText) {
        const itemId = typeof event.item_id === "string" ? event.item_id : undefined;
        const previousItemId = typeof event.previous_item_id === "string" ? event.previous_item_id : undefined;
        const capturedAt = new Date().toISOString();
        const deltaText = itemId ? transcriptDeltaItemsRef.current.get(itemId)?.text : "";
        const matchingInterimText = interimTranscriptRef.current
          && (!itemId || interimTranscriptRef.current.itemId === itemId || areSameTranscript(interimTranscriptRef.current.text, transcriptText))
          ? interimTranscriptRef.current.text
          : "";
        const completedTranscriptText = chooseMostCompleteTranscript(transcriptText, deltaText, matchingInterimText);
        if (itemId) {
          transcriptDeltaItemsRef.current.delete(itemId);
          if (interimTranscriptRef.current?.itemId === itemId) {
            interimTranscriptRef.current = null;
          }
        }
        if (interimTranscriptRef.current && areSameTranscript(interimTranscriptRef.current.text, transcriptText)) {
          interimTranscriptRef.current = null;
        }
        const turn = registerTranscriptText({
          text: completedTranscriptText,
          itemId,
          previousItemId,
          capturedAt
        });
        const recentTranscript = getRecentTranscriptText();
        const detectedQuestion = deriveLatestConversationFocus(recentTranscript, completedTranscriptText, contextRef.current);
        const transcriptEvent: OverlayTranscriptEvent = {
          transcriptText: completedTranscriptText,
          detectedQuestion,
          itemId: turn?.itemId,
          previousItemId,
          speaker: "interviewer",
          isFinal: true,
          capturedAt
        };
        void window.interviewDesktop?.updateOverlayContext?.({
          latestTranscriptEvent: transcriptEvent
        });
        pendingSpeechRef.current = false;
        currentSpeechStartedAtRef.current = 0;
        updateRealtimeStatus("listening", "Konteks siap dari transcript terbaru.");
      } else {
        pendingSpeechRef.current = false;
        currentSpeechStartedAtRef.current = 0;
      }
      return;
    }

    if (type === "response.output_text.delta") {
      const delta = typeof event.delta === "string" ? event.delta : "";
      if (!delta) return;
      if (isActiveKeywordResponseEvent(event)) {
        keywordStreamingResponseRef.current += delta;
        return;
      }
      if (!isActiveRealtimeResponseEvent(event)) return;

      streamingResponseRef.current += delta;
      const points = formatRealtimeResponsePoints(streamingResponseRef.current, {
        action: activeRealtimeResponseRef.current?.action,
        conversationMode: activeRealtimeResponseRef.current?.conversationMode,
        sourceText: activeRealtimeResponseRef.current?.sourceText
      });
      setActiveResponse((current) => current
        ? { ...current, points: points.length ? points : ["Menyiapkan bantuan realtime..."] }
        : current);
      setMode("response");
      return;
    }

    if (type === "response.output_text.done") {
      const textDone = typeof event.text === "string" ? event.text.trim() : "";
      if (isActiveKeywordResponseEvent(event)) {
        if (textDone && !keywordStreamingResponseRef.current.trim()) {
          keywordStreamingResponseRef.current = textDone;
        }
        return;
      }
      if (!isActiveRealtimeResponseEvent(event)) return;
      if (textDone && !streamingResponseRef.current.trim()) {
        streamingResponseRef.current = textDone;
      }
      return;
    }

    if (type === "response.done") {
      if (isActiveKeywordResponseEvent(event)) {
        const finalText = extractRealtimeResponseText(event) || keywordStreamingResponseRef.current.trim();
        finishRealtimeKeywordResponse(finalText);
        return;
      }

      if (!isActiveRealtimeResponseEvent(event)) return;
      const finalText = extractRealtimeResponseText(event) || streamingResponseRef.current.trim();
      if (!finalText) {
        if (retryEmptyRealtimeResponse()) {
          return;
        }

        setActiveResponse((current) => current
          ? { ...current, points: buildEmptyRealtimeResponsePoints() }
          : {
            title: "Meeting Help",
            kind: "notice",
            points: buildEmptyRealtimeResponsePoints()
          });
        streamingResponseRef.current = "";
        activeResponseFinalRef.current = true;
        activeRealtimeResponseRef.current = null;
        updateRealtimeStatus("listening", "Realtime tersambung. Bantuan kosong, coba kirim ulang jika perlu.");
        setMode("response");
        return;
      }

      setActiveResponse((current) => current
        ? { ...current, points: formatRealtimeResponsePoints(finalText, {
          action: activeRealtimeResponseRef.current?.action,
          conversationMode: activeRealtimeResponseRef.current?.conversationMode,
          sourceText: activeRealtimeResponseRef.current?.sourceText
        }) }
        : {
          title: "Meeting Help",
          kind: "help",
          points: formatRealtimeResponsePoints(finalText, {
            action: activeRealtimeResponseRef.current?.action,
            conversationMode: activeRealtimeResponseRef.current?.conversationMode,
            sourceText: activeRealtimeResponseRef.current?.sourceText
          })
        });
      streamingResponseRef.current = "";
      activeResponseFinalRef.current = true;
      activeRealtimeResponseRef.current = null;
      const audioReady = contextRef.current.audioStatus === "ready";
      const nextStatus = audioReady ? "listening" : "connected";
      const nextMessage = audioReady
        ? `Listening via ${contextRef.current.audioDeviceLabel || "active system output"}`
        : "Realtime tersambung. Menunggu audio meeting.";
      updateRealtimeStatus(nextStatus, nextMessage);
      void window.interviewDesktop?.reportRealtimeClientEvent?.({
        type: "listening",
        message: nextMessage
      });
      setMode("response");
      return;
    }

    if (type === "error") {
      const error = event.error && typeof event.error === "object" ? event.error as Record<string, unknown> : {};
      const message = typeof error.message === "string" ? error.message : "Realtime API error.";
      if (activeKeywordResponseRef.current && !activeRealtimeResponseRef.current) {
        activeKeywordResponseRef.current = null;
        keywordStreamingResponseRef.current = "";
        runtimeKeywordInFlightRef.current = false;
        setRuntimeKeywordStatus(contextRef.current.runtimeKeywords?.length ? "ready" : "error");
        if (getPendingRuntimeKeywordRequest()) {
          scheduleRuntimeKeywordFlush(700);
        }
        return;
      }

      updateRealtimeStatus("error", message);
      setActiveResponse(buildRealtimeUnavailableResponse(message));
      setMode("response");
      void window.interviewDesktop?.reportRealtimeClientEvent?.({
        type: "error",
        message
      });
    }
  }

  function sendRealtimeClientEvent(event: Record<string, unknown>) {
    const socket = realtimeSocketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    socket.send(JSON.stringify(event));
    return true;
  }

  function sendRealtimeKeywordRequest(payload: RuntimeKeywordRequestPayload) {
    const snapshot = getKeywordConversationSnapshot({ maxAgeMs: conversationMemoryMs });
    const itemSent = sendRealtimeClientEvent({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: buildRealtimeActionPrompt({
              action: "surface_keywords",
              latestQuestion: snapshot?.focus || latestFocusRef.current,
              recentTranscript: payload.transcriptSegment,
              conversationMode: snapshot?.conversationMode || classifyMeetingConversationMode(payload.transcriptSegment)
            })
          }
        ]
      }
    });
    const responseSent = sendRealtimeClientEvent({
      type: "response.create",
      response: {
        output_modalities: ["text"],
        max_output_tokens: 80
      }
    });

    return itemSent && responseSent;
  }

  function getRealtimeResponseId(event: Record<string, unknown>) {
    if (typeof event.response_id === "string" && event.response_id.trim()) {
      return event.response_id.trim();
    }

    const response = event.response && typeof event.response === "object"
      ? event.response as Record<string, unknown>
      : null;
    return typeof response?.id === "string" && response.id.trim() ? response.id.trim() : "";
  }

  function isActiveRealtimeResponseEvent(event: Record<string, unknown>) {
    const active = activeRealtimeResponseRef.current;
    if (!active || !isCurrentRequest(active.requestId)) {
      return false;
    }

    const responseId = getRealtimeResponseId(event);
    if (active.responseId && responseId) {
      return active.responseId === responseId;
    }

    if (active.responseId && !responseId) {
      return realtimeStatusRef.current === "responding";
    }

    if (!active.responseId && responseId) {
      activeRealtimeResponseRef.current = {
        ...active,
        responseId
      };
    }

    return realtimeStatusRef.current === "responding";
  }

  function isActiveKeywordResponseEvent(event: Record<string, unknown>) {
    const active = activeKeywordResponseRef.current;
    if (!active || runtimeKeywordGenerationRef.current !== active.generation) {
      return false;
    }

    const responseId = getRealtimeResponseId(event);
    if (active.responseId && responseId) {
      return active.responseId === responseId;
    }

    if (!active.responseId && responseId) {
      activeKeywordResponseRef.current = {
        ...active,
        responseId
      };
      return true;
    }

    return !activeRealtimeResponseRef.current;
  }

  function finishRealtimeKeywordResponse(text: string) {
    const active = activeKeywordResponseRef.current;
    if (!active) {
      return;
    }

    const pendingRequest = getPendingRuntimeKeywordRequest();
    const hasNewerPending = Boolean(
      pendingRequest
      && pendingRequest.generation === active.generation
      && pendingRequest.fingerprint !== active.fingerprint
    );
    const stillLatest = runtimeKeywordRequestRef.current === active.requestKey && !hasNewerPending;
    activeKeywordResponseRef.current = null;
    keywordStreamingResponseRef.current = "";
    runtimeKeywordInFlightRef.current = false;

    if (runtimeKeywordGenerationRef.current === active.generation && stillLatest) {
      const nextKeywords = parseRealtimeKeywordTerms(text);
      syncRuntimeKeywords(nextKeywords);
      setRuntimeKeywordStatus(nextKeywords.length ? "ready" : hasRealtimeKeywordContract(text) ? "empty" : "error");
      if (nextKeywords.length) {
        setMode((current) => current === "mini" ? "expanded" : current);
      }
    }

    if (getPendingRuntimeKeywordRequest()?.generation === active.generation) {
      scheduleRuntimeKeywordFlush(0);
    }
  }

  function cancelActiveRealtimeResponse() {
    const active = activeRealtimeResponseRef.current;
    const responseId = active?.responseId;
    const shouldCancel = Boolean(active) || realtimeStatusRef.current === "responding";
    if (shouldCancel) {
      sendRealtimeClientEvent(responseId
        ? { type: "response.cancel", response_id: responseId }
        : { type: "response.cancel" });
    }

    activeRealtimeResponseRef.current = null;
    streamingResponseRef.current = "";
  }

  function cancelActiveKeywordResponse() {
    const active = activeKeywordResponseRef.current;
    if (!active) {
      return;
    }

    if (active.responseId) {
      sendRealtimeClientEvent({ type: "response.cancel", response_id: active.responseId });
    } else {
      sendRealtimeClientEvent({ type: "response.cancel" });
    }

    activeKeywordResponseRef.current = null;
    keywordStreamingResponseRef.current = "";
    runtimeKeywordInFlightRef.current = false;
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
    void window.interviewDesktop?.updateOverlayContext?.({
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

  async function sendRealtimeActionToSocket(payload: RealtimeOverlayAction) {
    cancelActiveKeywordResponse();
    cancelActiveRealtimeResponse();

    streamingResponseRef.current = "";
    activeResponseFinalRef.current = false;
    activeRealtimeResponseRef.current = {
      requestId: payload.requestId,
      action: payload.action,
      conversationMode: payload.conversationMode,
      sourceText: [payload.recentTranscript, payload.latestQuestion, payload.triggerText].filter(Boolean).join("\n"),
      payload,
      retryCount: 0
    };
    updateRealtimeStatus("responding", "Realtime sedang membuat bantuan...");
    void window.interviewDesktop?.reportRealtimeClientEvent?.({
      type: "responding",
      message: "Realtime sedang membuat bantuan..."
    });
    setActiveResponse({
      title: getRealtimeActionTitle(payload),
      kind: "help",
      points: ["Menyiapkan bantuan realtime..."]
    });
    setMode("response");

    const sent = sendRealtimeActionEvents(payload);

    if (!sent) {
      updateRealtimeStatus("error", "Realtime session belum aktif.");
      return false;
    }

    return true;
  }

  function sendRealtimeActionEvents(payload: RealtimeOverlayAction) {
    const itemSent = sendRealtimeClientEvent({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: buildRealtimeActionPrompt(payload)
          }
        ]
      }
    });
    const responseSent = sendRealtimeClientEvent({
      type: "response.create",
      response: {
        output_modalities: ["text"],
        max_output_tokens: 500
      }
    });

    return itemSent && responseSent;
  }

  function retryEmptyRealtimeResponse() {
    const active = activeRealtimeResponseRef.current;
    if (!active?.payload || (active.retryCount || 0) >= 1) {
      return false;
    }

    const retryCount = (active.retryCount || 0) + 1;
    activeRealtimeResponseRef.current = {
      ...active,
      responseId: undefined,
      retryCount
    };
    streamingResponseRef.current = "";
    setActiveResponse((current) => current
      ? { ...current, points: ["Mencoba ulang bantuan realtime..."] }
      : current);
    return sendRealtimeActionEvents(active.payload);
  }

  async function requestHelp(type: string, triggerText?: string) {
    if (activeResponse?.kind === "help" && activeResponseFinalRef.current) {
      setRecentHelp((items) => [activeResponse, ...items].slice(0, 5));
    }

    const requestId = activeRequestRef.current + 1;
    activeRequestRef.current = requestId;
    cancelActiveKeywordResponse();
    cancelActiveRealtimeResponse();
    activeResponseFinalRef.current = false;
    setMode("loading");

    if (!isRealtimeLive(context)) {
      window.setTimeout(() => {
        if (!isCurrentRequest(requestId)) return;
        setActiveResponse(buildRealtimeUnavailableResponse(context.realtimeMessage));
        setMode("response");
      }, 200);
      return;
    }

    if (type === "keyword" && !triggerText) {
      setActiveResponse(buildNoKeywordResponse());
      setMode("response");
      return;
    }

    const shouldRequireConversation = isConversationHelpActionName(type);
    if (shouldRequireConversation && pendingSpeechRef.current) {
      if (!getStableConversationSnapshot({ blockPendingSpeech: true })) {
        window.setTimeout(() => {
          if (!isCurrentRequest(requestId)) return;
          void sendHelpAction(requestId, type, triggerText);
        }, 1500);
        return;
      }
    }

    await sendHelpAction(requestId, type, triggerText);
  }

  async function sendHelpAction(requestId: number, type: string, triggerText?: string) {
    const shouldRequireConversation = isConversationHelpActionName(type);
    const freshContext = getStableConversationSnapshot({ blockPendingSpeech: shouldRequireConversation });

    if (shouldRequireConversation && !freshContext) {
      if (!isCurrentRequest(requestId)) return;
      setActiveResponse(buildNoFreshContextResponse());
      setMode("response");
      return;
    }

    const inferredMode = freshContext?.conversationMode || classifyMeetingConversationMode(triggerText || latestFocusRef.current);
    const conversationMode = getExplicitActionConversationMode(type) || inferredMode;

    const response = await sendRealtimeActionToSocket({
      requestId,
      action: type as RealtimeOverlayAction["action"],
      latestQuestion: freshContext?.focus || latestFocusRef.current,
      recentTranscript: freshContext?.windowText || getRecentTranscriptText(),
      triggerText,
      conversationMode
    });

    if (!response) {
      if (!isCurrentRequest(requestId)) return;
      setActiveResponse(buildRealtimeUnavailableResponse(context.realtimeMessage));
      setMode("response");
    }
  }

  function submitAsk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const text = String(formData.get("ask") || "").trim();
    if (!text) return;
    form.reset();
    if (looksLikeMeetingQuestion(text) || isDomainRelatedText(text, context)) {
      void window.interviewDesktop?.updateOverlayContext?.({
        latestQuestion: text
      });
    }
    void requestHelp("ask", text);
  }

  function endInterview() {
    void window.interviewDesktop?.endOverlayInterview?.({
      liveMeetingSessionId: context.liveMeetingSessionId,
      meetingContextId: context.meetingContextId,
      transcriptText: getFullTranscriptText()
    });
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

    return transcript || `Meeting untuk ${context.contextName || "context"} - ${context.meetingTopic || "topic"}. Transcript live belum tertangkap.`;
  }

  if (mode === "mini") {
    return (
      <main className="overlay-root mini">
        <section className="overlay-bar drag-region" onPointerDown={beginDrag}>
          <span className="overlay-chip"><span className="pulse" /> Listening {formatTime(seconds)}</span>
          <span className={`overlay-chip audio ${context.audioStatus === "ready" ? "ready" : "warn"}`}>
            {context.audioStatus === "ready" ? `${getOverlayAudioSourceLabel(context)} OK` : "Audio setup"}
          </span>
          <button className="overlay-button no-drag" onClick={toggleExpanded}>Ask *</button>
          <button className="overlay-end no-drag" onClick={endInterview} aria-label="End meeting" />
        </section>
      </main>
    );
  }

  const hasResponseShell = mode === "loading" || mode === "response";
  const focusDisplayText = getFocusDisplayText(latestFocus);

  return (
    <main className={`overlay-root panel ${hasResponseShell ? "with-response" : ""}`}>
      <section className={`overlay-panel drag-region ${hasResponseShell ? "compact-when-response" : ""}`} onPointerDown={beginDrag}>
        <div className="overlay-top">
          <div>
            <p className="overlay-kicker">Listening {formatTime(seconds)}</p>
            <h1>Live Meeting</h1>
            <p>{context.contextName} - {context.meetingTopic}</p>
            <p className="overlay-audio-status">
              {getOverlayAudioStatusText(context)}
            </p>
          </div>
          <button className="overlay-button no-drag" onClick={toggleExpanded}>Hide</button>
        </div>

        <div className="overlay-card question-card">
          <strong>Latest conversation focus</strong>
          <p>{focusDisplayText}</p>
        </div>

        <div className="overlay-actions">
          <button onClick={() => requestHelp("answer_qna")}>Jawab Pertanyaan</button>
          <button onClick={() => requestHelp("answer_convo")}>Tanggapi</button>
          <button onClick={() => requestHelp("followup")}>Pertanyaan Follow-up</button>
          <button onClick={() => requestHelp("explain")}>Jelaskan Maksudnya</button>
        </div>

        {context.runtimeKeywords?.length ? (
          <div className="overlay-keywords">
            {context.runtimeKeywords.slice(0, 3).map((keyword) => (
              <button key={keyword} onClick={() => requestHelp("keyword", keyword)}>{keyword}</button>
            ))}
          </div>
        ) : (
          <div className="overlay-card keyword-empty-card">
            <strong>Runtime keyword chips</strong>
            <p>{getRuntimeKeywordMessage(runtimeKeywordStatus, context)}</p>
          </div>
        )}

        <form className="overlay-ask" onSubmit={submitAsk}>
          <input name="ask" placeholder="Tulis bantuan spesifik..." />
          <button type="submit">Ask</button>
        </form>

        {recentHelp.length ? (
          <div className="overlay-card history">
            <strong>Recent Help</strong>
            {recentHelp.map((item) => (
              <p key={`${item.title}-${item.points[0]}`}>{item.title} - {item.points[0]}</p>
            ))}
          </div>
        ) : null}
      </section>

      {mode === "loading" ? (
        <aside className="response-shell drag-region" onPointerDown={beginDrag}>
          <h2>Menyiapkan bantuan...</h2>
          <div className="overlay-loading">
            <span />
            <span />
            <span />
          </div>
        </aside>
      ) : null}

      {mode === "response" && activeResponse ? (
        <aside className="response-shell drag-region" onPointerDown={beginDrag}>
          <div className="response-top">
            <div>
              <p className="overlay-kicker">Meeting help</p>
              <h2>{activeResponse.title}</h2>
            </div>
            <button className="overlay-button no-drag" onClick={closeResponse}>Close</button>
          </div>
          <ul>
            {activeResponse.points.map((point) => <li key={point}>{point}</li>)}
          </ul>
        </aside>
      ) : null}
    </main>
  );
}

function getOverlayAudioSourceLabel(context: OverlayContext) {
  return context.audioSourceKind === "system-candidate" || context.audioSourceKind === "system-loopback" ? "System" : "Mic";
}

function getOverlayAudioStatusText(context: OverlayContext) {
  if (context.realtimeStatus === "connecting") {
    return "Realtime connecting";
  }

  if (context.realtimeStatus === "connected") {
    return context.realtimeMessage || "Realtime tersambung. Mencari audio meeting";
  }

  if (context.realtimeStatus === "audio_waiting") {
    return context.realtimeMessage || "Mencari audio meeting";
  }

  if (context.realtimeStatus === "listening") {
    return context.realtimeMessage || "Realtime listening";
  }

  if (context.realtimeStatus === "responding") {
    return "Realtime responding";
  }

  if (context.realtimeStatus === "error") {
    return context.realtimeMessage || "Realtime error";
  }

  if (context.audioStatus === "ready") {
    return context.audioDeviceLabel
      ? `${getOverlayAudioSourceLabel(context)} audio OK: ${context.audioDeviceLabel}`
      : `${getOverlayAudioSourceLabel(context)} audio OK`;
  }

  if (context.audioStatus === "waiting") {
    return "Mencari active system audio";
  }

  if (context.audioStatus === "silent") {
    return "Realtime tersambung, audio sedang silent";
  }

  if (context.audioStatus === "loading" || context.audioStatus === "checking") {
    return context.realtimeMessage || "Audio checking";
  }

  return "Audio needs validation";
}

function getFocusDisplayText(focus: string) {
  const normalized = focus.trim();
  return normalized && normalized !== waitingFocusText ? normalized : "Belum ada konteks percakapan tertangkap.";
}

function isRealtimeLive(context: OverlayContext) {
  return context.realtimeStatus === "connected"
    || context.realtimeStatus === "audio_waiting"
    || context.realtimeStatus === "listening"
    || context.realtimeStatus === "responding";
}

function getRealtimeActionTitle(payload: RealtimeOverlayAction) {
  if (payload.action === "answer_qna") return "Jawab Pertanyaan";
  if (payload.action === "answer_convo") return "Tanggapi";
  if (payload.action === "answer") return "Jawab Pertanyaan";
  if (payload.action === "followup") return "Pertanyaan Follow-up";
  if (payload.action === "explain") return "Jelaskan Maksudnya";
  if (payload.action === "keyword") return `Keyword: ${payload.triggerText || "Keyword"}`;
  return "Ask";
}

function buildEmptyRealtimeResponsePoints() {
  return [
    "Bantuan realtime belum menghasilkan teks.",
    "Konteks meeting tetap tersimpan; coba klik tombol bantuan lagi jika respons belum muncul.",
    "Jika ini sering terjadi, tutup dan buka ulang overlay untuk menyegarkan koneksi Realtime."
  ];
}

function formatTime(totalSeconds: number) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function sameKeywordTerms(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((term, index) => term === right[index]);
}

function buildTranscriptEventFingerprint(event: OverlayTranscriptEvent) {
  return [
    event.itemId || "local",
    event.capturedAt || "",
    normalizeRuntimeFingerprintText(event.transcriptText || "")
  ].join("::");
}

function buildKeywordRequestFingerprint(value: string) {
  const normalized = normalizeRuntimeFingerprintText(value);
  return normalized.length <= 360 ? normalized : normalized.slice(normalized.length - 360);
}

function parseRealtimeKeywordTerms(text: string) {
  const keywordLine = text
    .split(/\n+/)
    .map((line) => line.trim())
    .find((line) => /^KEYWORDS\s*:/i.test(line));
  if (!keywordLine) {
    return [];
  }

  const [, rawKeywords = ""] = keywordLine.split(/KEYWORDS\s*:/i);
  return rawKeywords
    .split("|")
    .map((term) => term.replace(/^[-*\u2022]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 3);
}

function hasRealtimeKeywordContract(text: string) {
  return /^KEYWORDS\s*:/im.test(text);
}

function normalizeRuntimeFingerprintText(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

