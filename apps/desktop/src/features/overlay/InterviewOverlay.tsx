import { FormEvent, PointerEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RealtimeContext } from "@interview-app/shared";
import { buildKeywordSourceText, buildLocalRuntimeKeywords } from "./runtime-rules/runtime-keyword-rules.js";
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
  areSameTranscript,
  buildConversationWindow,
  chooseMostCompleteTranscript,
  deriveLatestConversationFocus,
  isDomainRelatedText,
  isLikelyTranscriptNoise,
  looksLikeInterviewerQuestion
} from "./runtime-rules/transcript-focus-rules.js";

type OverlayMode = "mini" | "expanded" | "loading" | "response";

type OverlayContext = {
  interviewRoundId?: string;
  applicationId?: string;
  companyName?: string;
  roleTitle?: string;
  stageType?: string;
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

const waitingFocusText = "Menunggu konteks percakapan interviewer.";
const conversationMemoryMs = 120_000;
const actionFreshConversationMs = 30_000;
const audioTranscriptGraceMs = 2_500;

const fallbackContext: OverlayContext = {
  companyName: "Interview",
  roleTitle: "Active session",
  stageType: "HR",
  domainLabel: "application domain",
  runtimeKeywords: []
};

export function InterviewOverlay() {
  const [context, setContext] = useState<OverlayContext>(fallbackContext);
  const [mode, setMode] = useState<OverlayMode>("mini");
  const [seconds, setSeconds] = useState(0);
  const [recentHelp, setRecentHelp] = useState<HelpResponse[]>([]);
  const [activeResponse, setActiveResponse] = useState<HelpResponse | null>(null);
  const [latestFocus, setLatestFocus] = useState(waitingFocusText);
  const [conversationWindow, setConversationWindow] = useState("");
  const [lastTranscriptAt, setLastTranscriptAt] = useState("");
  const [runtimeKeywordStatus, setRuntimeKeywordStatus] = useState<RuntimeKeywordStatus>("idle");
  const contextRef = useRef<OverlayContext>(fallbackContext);
  const activeRequestRef = useRef(0);
  const runtimeKeywordRequestRef = useRef("");
  const streamingResponseRef = useRef("");
  const realtimeSocketRef = useRef<WebSocket | null>(null);
  const realtimeStatusRef = useRef("");
  const recentTranscriptRef = useRef<string[]>([]);
  const conversationTurnsRef = useRef<ConversationTurn[]>([]);
  const transcriptItemsRef = useRef(new Map<string, ConversationTurn>());
  const transcriptOrderRef = useRef<string[]>([]);
  const transcriptDeltaItemsRef = useRef(new Map<string, { text: string; previousItemId?: string; capturedAt: string }>());
  const interimTranscriptRef = useRef<ConversationTurn | null>(null);
  const transcriptSequenceRef = useRef(0);
  const pendingSpeechRef = useRef(false);
  const currentSpeechStartedAtRef = useRef(0);
  const latestAudioSignalAtRef = useRef(0);
  const latestFocusRef = useRef(waitingFocusText);
  const conversationWindowRef = useRef("");

  function applyContext(payload: unknown) {
    if (!payload || typeof payload !== "object") return;

    const nextContext = payload as OverlayContext;
    const incomingRoundId = typeof nextContext.interviewRoundId === "string" ? nextContext.interviewRoundId : undefined;
    const currentRoundId = typeof contextRef.current.interviewRoundId === "string" ? contextRef.current.interviewRoundId : undefined;
    const isNewRound = Boolean(incomingRoundId) && incomingRoundId !== currentRoundId;
    const mergedContext = {
      ...(isNewRound ? fallbackContext : contextRef.current),
      ...nextContext
    };

    contextRef.current = mergedContext;
    setContext(mergedContext);

    if (nextContext.latestTranscriptEvent) {
      registerTranscriptEvent(nextContext.latestTranscriptEvent);
    }

    if (isNewRound) {
      activeRequestRef.current += 1;
      runtimeKeywordRequestRef.current = "";
      recentTranscriptRef.current = [];
      conversationTurnsRef.current = [];
      transcriptItemsRef.current = new Map();
      transcriptOrderRef.current = [];
      transcriptDeltaItemsRef.current = new Map();
      interimTranscriptRef.current = null;
      transcriptSequenceRef.current = 0;
      pendingSpeechRef.current = false;
      currentSpeechStartedAtRef.current = 0;
      latestAudioSignalAtRef.current = 0;
      latestFocusRef.current = waitingFocusText;
      conversationWindowRef.current = "";
      setActiveResponse(null);
      setRecentHelp([]);
      setSeconds(0);
      setLatestFocus(waitingFocusText);
      setConversationWindow("");
      setLastTranscriptAt("");
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
        if (nextStatus === "ready") {
          latestAudioSignalAtRef.current = Date.now();
        }
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
          title: typeof event.title === "string" ? event.title : "AI Help",
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
        const points = formatRealtimeResponsePoints(streamingResponseRef.current);
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
          ? { ...current, points: formatRealtimeResponsePoints(finalText) }
          : {
            title: "AI Help",
            kind: "help",
            points: formatRealtimeResponsePoints(finalText)
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
    if (!context.realtimeContext) {
      return;
    }

    if (!hasFreshConversationContext() || !latestFocus.trim() || latestFocus === waitingFocusText) {
      if (context.runtimeKeywords?.length) {
        syncRuntimeKeywords([]);
      }
      runtimeKeywordRequestRef.current = "";
      setRuntimeKeywordStatus("idle");
      return;
    }

    const recentTranscript = conversationWindow || getRecentTranscriptText();
    const keywordSourceText = buildKeywordSourceText(latestFocus, recentTranscript);
    const requestKey = `${context.interviewRoundId || "draft"}::${latestFocus.trim()}::${keywordSourceText.slice(-240)}`;
    if (runtimeKeywordRequestRef.current === requestKey) {
      return;
    }

    runtimeKeywordRequestRef.current = requestKey;
    setRuntimeKeywordStatus("loading");
    syncRuntimeKeywords([]);

    const nextKeywords = buildLocalRuntimeKeywords(latestFocus, context, keywordSourceText);
    syncRuntimeKeywords(nextKeywords);
    setRuntimeKeywordStatus(nextKeywords.length ? "ready" : "empty");

    if (nextKeywords.length) {
      setMode((current) => current === "mini" ? "expanded" : current);
    }
  }, [context.interviewRoundId, context.realtimeContext, context.runtimeKeywords, latestFocus, conversationWindow, lastTranscriptAt]);

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
      return "mini";
    });
  }

  function closeResponse() {
    activeRequestRef.current += 1;
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
      updateRealtimeStatus("audio_waiting", "Mencari audio interview dari active system output...");
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
    if (type === "input_audio_buffer.speech_started") {
      pendingSpeechRef.current = true;
      currentSpeechStartedAtRef.current = Date.now();
      updateRealtimeStatus("listening", "Menangkap ucapan interviewer...");
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
      }
      return;
    }

    if (type === "response.output_text.delta") {
      const delta = typeof event.delta === "string" ? event.delta : "";
      if (!delta) return;

      streamingResponseRef.current += delta;
      const points = formatRealtimeResponsePoints(streamingResponseRef.current);
      setActiveResponse((current) => current
        ? { ...current, points: points.length ? points : ["Menyiapkan bantuan realtime..."] }
        : current);
      setMode("response");
      return;
    }

    if (type === "response.output_text.done") {
      const textDone = typeof event.text === "string" ? event.text.trim() : "";
      if (textDone && !streamingResponseRef.current.trim()) {
        streamingResponseRef.current = textDone;
      }
      return;
    }

    if (type === "response.done") {
      const finalText = extractRealtimeResponseText(event) || streamingResponseRef.current.trim();
      setActiveResponse((current) => current
        ? { ...current, points: formatRealtimeResponsePoints(finalText) }
        : {
          title: "AI Help",
          kind: "help",
          points: formatRealtimeResponsePoints(finalText)
        });
      streamingResponseRef.current = "";
      const audioReady = contextRef.current.audioStatus === "ready";
      const nextStatus = audioReady ? "listening" : "connected";
      const nextMessage = audioReady
        ? `Listening via ${contextRef.current.audioDeviceLabel || "active system output"}`
        : "Realtime tersambung. Menunggu audio interview.";
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

  function registerTranscriptEvent(event: OverlayTranscriptEvent) {
    if (!event.transcriptText || event.speaker === "candidate" || event.speaker === "system") {
      return null;
    }

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
    if (!nextText || isLikelyTranscriptNoise(nextText)) {
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
    if (!normalized || isLikelyTranscriptNoise(normalized)) {
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
    const nextFocus = deriveLatestConversationFocus(nextWindow, latestTurn?.text || "", contextRef.current) || latestTurn?.text || waitingFocusText;

    conversationWindowRef.current = nextWindow;
    latestFocusRef.current = nextFocus;
    setConversationWindow(nextWindow);
    setLatestFocus(nextFocus);
    setLastTranscriptAt(latestTurn?.capturedAt || "");
    void window.interviewDesktop?.updateOverlayContext?.({
      latestQuestion: nextFocus
    });
  }

  function getRecentTranscriptText() {
    const maxLength = 1400;
    const joined = conversationWindowRef.current || recentTranscriptRef.current.join("\n").trim();
    if (joined.length <= maxLength) {
      return joined;
    }

    return joined.slice(joined.length - maxLength).trim();
  }

  function hasFreshConversationContext() {
    return Boolean(getFreshConversationSnapshot({
      maxAgeMs: conversationMemoryMs,
      blockIfAudioOutrunsTranscript: false
    }));
  }

  function getTurnCapturedAfter(turn: ConversationTurn | null | undefined, startedAtMs: number) {
    if (!turn) {
      return null;
    }

    const capturedTime = new Date(turn.capturedAt).getTime();
    return Number.isFinite(capturedTime) && capturedTime >= startedAtMs ? turn : null;
  }

  function getFreshConversationSnapshot(options: {
    maxAgeMs?: number;
    blockIfAudioOutrunsTranscript?: boolean;
  } = {}) {
    const maxAgeMs = options.maxAgeMs ?? actionFreshConversationMs;
    const blockIfAudioOutrunsTranscript = options.blockIfAudioOutrunsTranscript ?? true;
    const speechStartedAt = currentSpeechStartedAtRef.current;
    const latestInterimTurn = interimTranscriptRef.current;
    const latestFinalTurn = conversationTurnsRef.current.at(-1);
    const latestTurn = pendingSpeechRef.current && speechStartedAt
      ? getTurnCapturedAfter(latestInterimTurn, speechStartedAt) || getTurnCapturedAfter(latestFinalTurn, speechStartedAt)
      : latestInterimTurn || latestFinalTurn;
    if (!latestTurn) {
      return null;
    }

    const capturedTime = new Date(latestTurn.capturedAt).getTime();
    if (!Number.isFinite(capturedTime) || Date.now() - capturedTime > maxAgeMs) {
      return null;
    }

    if (pendingSpeechRef.current && speechStartedAt && capturedTime < speechStartedAt) {
      return null;
    }

    if (
      blockIfAudioOutrunsTranscript
      && latestAudioSignalAtRef.current
      && latestAudioSignalAtRef.current > capturedTime + audioTranscriptGraceMs
    ) {
      return null;
    }

    if (contextRef.current.realtimeStatus === "error") {
      return null;
    }

    const windowText = getRecentTranscriptText();
    if (!windowText.trim()) {
      return null;
    }

    return {
      focus: latestFocusRef.current !== waitingFocusText ? latestFocusRef.current : latestTurn.text,
      windowText,
      capturedAt: latestTurn.capturedAt
    };
  }

  async function sendRealtimeActionToSocket(payload: RealtimeOverlayAction) {
    if (realtimeStatusRef.current === "responding") {
      sendRealtimeClientEvent({ type: "response.cancel" });
    }

    streamingResponseRef.current = "";
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

    if (!itemSent || !responseSent) {
      updateRealtimeStatus("error", "Realtime session belum aktif.");
      return false;
    }

    return true;
  }

  async function requestHelp(type: string, triggerText?: string) {
    if (activeResponse?.kind === "help") {
      setRecentHelp((items) => [activeResponse, ...items].slice(0, 5));
    }

    const requestId = activeRequestRef.current + 1;
    activeRequestRef.current = requestId;
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

    const shouldRequireConversation = type === "answer" || type === "followup" || type === "explain" || type === "keyword";
    if (shouldRequireConversation && pendingSpeechRef.current) {
      if (!getFreshConversationSnapshot()) {
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
    const shouldRequireConversation = type === "answer" || type === "followup" || type === "explain" || type === "keyword";
    const freshContext = getFreshConversationSnapshot({
      maxAgeMs: actionFreshConversationMs,
      blockIfAudioOutrunsTranscript: true
    });

    if (shouldRequireConversation && !freshContext) {
      if (!isCurrentRequest(requestId)) return;
      setActiveResponse(buildNoFreshContextResponse());
      setMode("response");
      return;
    }

    const response = await sendRealtimeActionToSocket({
      requestId,
      action: type as RealtimeOverlayAction["action"],
      latestQuestion: freshContext?.focus || latestFocusRef.current,
      recentTranscript: freshContext?.windowText || getRecentTranscriptText(),
      triggerText
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
    if (looksLikeInterviewerQuestion(text) || isDomainRelatedText(text, context)) {
      void window.interviewDesktop?.updateOverlayContext?.({
        latestQuestion: text
      });
    }
    void requestHelp("ask", text);
  }

  function endInterview() {
    void window.interviewDesktop?.endOverlayInterview?.({
      interviewRoundId: context.interviewRoundId,
      applicationId: context.applicationId,
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

    return transcript || `Interview ${context.stageType || "HR"} untuk ${context.companyName || "company"} - ${context.roleTitle || "role"}. Transcript live belum tertangkap.`;
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
          <button className="overlay-end no-drag" onClick={endInterview} aria-label="End interview" />
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
            <h1>{context.stageType} Interview</h1>
            <p>{context.companyName} - {context.roleTitle}</p>
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
          <button onClick={() => requestHelp("answer")}>Bantu Jawab</button>
          <button onClick={() => requestHelp("followup")}>Bantu Follow-up</button>
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
          <h2>Generating help...</h2>
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
              <p className="overlay-kicker">AI help</p>
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
    return context.realtimeMessage || "Realtime tersambung. Mencari audio interview";
  }

  if (context.realtimeStatus === "audio_waiting") {
    return context.realtimeMessage || "Mencari audio interview";
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
  if (payload.action === "answer") return "Bantu Jawab";
  if (payload.action === "followup") return "Bantu Follow-up";
  if (payload.action === "explain") return "Jelaskan Maksudnya";
  if (payload.action === "keyword") return `Keyword: ${payload.triggerText || "Keyword"}`;
  return "Ask";
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

