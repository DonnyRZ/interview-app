import { FormEvent, PointerEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RealtimeContext } from "@interview-app/shared";

type OverlayMode = "mini" | "expanded" | "loading" | "response";
type RuntimeKeywordStatus = "idle" | "loading" | "ready" | "empty" | "error";

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

type HelpResponse = {
  title: string;
  points: string[];
  kind: "help" | "notice";
};

const waitingQuestionPrefix = "Menunggu pertanyaan interviewer";

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
  const [latestQuestion, setLatestQuestion] = useState("Menunggu pertanyaan interviewer yang relevan dengan domain application.");
  const [runtimeKeywordStatus, setRuntimeKeywordStatus] = useState<RuntimeKeywordStatus>("idle");
  const contextRef = useRef<OverlayContext>(fallbackContext);
  const activeRequestRef = useRef(0);
  const runtimeKeywordRequestRef = useRef("");
  const streamingResponseRef = useRef("");
  const realtimeSocketRef = useRef<WebSocket | null>(null);
  const realtimeStatusRef = useRef("");
  const recentTranscriptRef = useRef<string[]>([]);

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

    setLatestQuestion((current) => {
      if (nextContext.latestQuestion?.trim()) {
        return nextContext.latestQuestion.trim();
      }

      const transcriptQuestion = deriveQuestionFromTranscriptEvent(nextContext.latestTranscriptEvent, mergedContext);
      if (transcriptQuestion) {
        return transcriptQuestion;
      }

      if (isNewRound) {
        return buildQuestion(mergedContext);
      }

      return current;
    });

    if (isNewRound) {
      activeRequestRef.current += 1;
      runtimeKeywordRequestRef.current = "";
      recentTranscriptRef.current = [];
      setActiveResponse(null);
      setRecentHelp([]);
      setSeconds(0);
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

    if (!isDetectedQuestion(latestQuestion)) {
      if (context.runtimeKeywords?.length) {
        syncRuntimeKeywords([]);
      }
      runtimeKeywordRequestRef.current = "";
      setRuntimeKeywordStatus("idle");
      return;
    }

    const recentTranscript = getRecentTranscriptText();
    const keywordSourceText = buildKeywordSourceText(latestQuestion, recentTranscript);
    const requestKey = `${context.interviewRoundId || "draft"}::${latestQuestion.trim()}::${keywordSourceText.slice(-240)}`;
    if (runtimeKeywordRequestRef.current === requestKey) {
      return;
    }

    runtimeKeywordRequestRef.current = requestKey;
    setRuntimeKeywordStatus("loading");
    syncRuntimeKeywords([]);

    const nextKeywords = buildLocalRuntimeKeywords(latestQuestion, context, keywordSourceText);
    syncRuntimeKeywords(nextKeywords);
    setRuntimeKeywordStatus(nextKeywords.length ? "ready" : "empty");

    if (nextKeywords.length) {
      setMode((current) => current === "mini" ? "expanded" : current);
    }
  }, [context.interviewRoundId, context.realtimeContext, context.runtimeKeywords, latestQuestion]);

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
    if (type === "conversation.item.input_audio_transcription.delta") {
      const delta = typeof event.delta === "string" ? event.delta : "";
      if (delta) {
        void window.interviewDesktop?.updateOverlayContext?.({
          realtimeTranscriptDelta: delta
        });
      }
      return;
    }

    if (type === "conversation.item.input_audio_transcription.completed") {
      const transcriptText = typeof event.transcript === "string" ? event.transcript.trim() : "";
      if (transcriptText) {
        const recentTranscript = appendRecentTranscript(transcriptText);
        const detectedQuestion = deriveContextFromTranscriptWindow(recentTranscript, transcriptText, contextRef.current);
        const transcriptEvent: OverlayTranscriptEvent = {
          transcriptText,
          detectedQuestion,
          speaker: "interviewer",
          isFinal: true,
          capturedAt: new Date().toISOString()
        };
        void window.interviewDesktop?.updateOverlayContext?.({
          latestTranscriptEvent: transcriptEvent
        });
        if (detectedQuestion) {
          setLatestQuestion(detectedQuestion);
        }
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
      updateRealtimeStatus("listening", "Realtime listening via system audio.");
      void window.interviewDesktop?.reportRealtimeClientEvent?.({
        type: "listening",
        message: "Realtime listening via system audio."
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

  function appendRecentTranscript(transcriptText: string) {
    const normalized = transcriptText.replace(/\s+/g, " ").trim();
    if (!normalized || isLikelyTranscriptNoise(normalized)) {
      return getRecentTranscriptText();
    }

    const lastItem = recentTranscriptRef.current.at(-1);
    if (lastItem !== normalized) {
      recentTranscriptRef.current = [...recentTranscriptRef.current, normalized].slice(-8);
    }

    return getRecentTranscriptText();
  }

  function getRecentTranscriptText() {
    const maxLength = 1400;
    const joined = recentTranscriptRef.current.join("\n").trim();
    if (joined.length <= maxLength) {
      return joined;
    }

    return joined.slice(joined.length - maxLength).trim();
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

    if ((type === "answer" || type === "followup" || type === "explain") && !isDetectedQuestion(latestQuestion)) {
      window.setTimeout(() => {
        if (!isCurrentRequest(requestId)) return;
        setActiveResponse(buildNoQuestionResponse());
        setMode("response");
      }, 300);
      return;
    }

    if (!isRealtimeLive(context)) {
      window.setTimeout(() => {
        if (!isCurrentRequest(requestId)) return;
        setActiveResponse(buildRealtimeUnavailableResponse(context.realtimeMessage));
        setMode("response");
      }, 200);
      return;
    }

    if (type === "keyword" && !triggerText) {
      setActiveResponse(buildDummyResponse(type, triggerText, context));
      setMode("response");
      return;
    }

    const response = await sendRealtimeActionToSocket({
      requestId,
      action: type as RealtimeOverlayAction["action"],
      latestQuestion,
      recentTranscript: getRecentTranscriptText(),
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
      setLatestQuestion(text);
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
      transcriptText: buildDummyTranscript(context)
    });
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
  const questionDisplayText = getQuestionDisplayText(latestQuestion);

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
          <strong>Latest detected question</strong>
          <p>{questionDisplayText}</p>
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

function buildQuestion(context: OverlayContext) {
  return `${waitingQuestionPrefix} yang relevan dengan ${context.domainLabel || "domain application"}.`;
}

function readLatestQuestion(context: OverlayContext) {
  const candidate = context.latestQuestion?.trim();
  return candidate || buildQuestion(context);
}

function getOverlayAudioSourceLabel(context: OverlayContext) {
  return context.audioSourceKind === "system-candidate" || context.audioSourceKind === "system-loopback" ? "System" : "Mic";
}

function getOverlayAudioStatusText(context: OverlayContext) {
  if (context.realtimeStatus === "connecting") {
    return "Realtime connecting";
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
    return `${getOverlayAudioSourceLabel(context)} audio OK`;
  }

  if (context.audioStatus === "loading" || context.audioStatus === "checking") {
    return "Audio checking";
  }

  return "Audio needs validation";
}

function isDetectedQuestion(question: string) {
  const normalized = question.trim();
  return Boolean(normalized) && !normalized.startsWith(waitingQuestionPrefix);
}

function getQuestionDisplayText(question: string) {
  return isDetectedQuestion(question) ? question : "Belum ada pertanyaan terdeteksi.";
}

function getRuntimeKeywordMessage(status: RuntimeKeywordStatus, context: OverlayContext) {
  if (status === "loading") {
    return "Mencari keyword relevan dari pertanyaan terbaru...";
  }

  if (status === "error") {
    return "Keyword belum berhasil dibuat. Coba kirim transcript lagi.";
  }

  if (status === "empty") {
    return "Belum ada keyword yang cukup relevan dari pertanyaan terbaru.";
  }

  return `Chips muncul saat topik interviewer relevan dengan ${context.domainLabel || "domain application"}.`;
}

function buildNoQuestionResponse(): HelpResponse {
  return {
    title: "Belum Ada Pertanyaan",
    kind: "notice",
    points: [
      "Belum ada pertanyaan interviewer yang terdeteksi.",
      "Buka kolom Ask dan tulis pertanyaan interviewer secara manual untuk sementara.",
      "Nanti setelah transcript live aktif, Bantu Jawab akan memakai pertanyaan terbaru otomatis."
    ]
  };
}

function buildRealtimeUnavailableResponse(message?: string): HelpResponse {
  return {
    title: "Realtime Belum Aktif",
    kind: "notice",
    points: [
      message || "Realtime session belum aktif.",
      "Live help harus tersambung ke gpt-realtime-mini dulu.",
      "Tidak ada fallback diam-diam ke gpt-5-mini untuk tombol interview live."
    ]
  };
}

function isRealtimeLive(context: OverlayContext) {
  return context.realtimeStatus === "listening" || context.realtimeStatus === "responding";
}

function formatRealtimeResponsePoints(text: string) {
  const cleaned = text.trim();
  if (!cleaned) {
    return [];
  }

  const linePoints = cleaned
    .split(/\n+/)
    .map((line) => line.replace(/^\s*[-*•]\s*/, "").trim())
    .map((line) => line.replace(/^BANTU_[A-Z_]+:\s*/i, "").trim())
    .filter(Boolean)
    .slice(0, 6);

  if (linePoints.length > 1 || cleaned.length < 160) {
    return linePoints;
  }

  return splitLongRealtimeParagraph(linePoints[0] || cleaned);
}

function splitLongRealtimeParagraph(text: string) {
  const normalized = text
    .replace(/\s+(\d+[.)])\s+/g, "\n$1 ")
    .replace(/\s+[-*â€¢]\s+/g, "\n")
    .trim();

  const numberedPoints = normalized
    .split(/\n+|(?=\b\d+[.)]\s+)/)
    .map((line) => line.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean);

  if (numberedPoints.length > 1) {
    return numberedPoints.slice(0, 6);
  }

  return normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, 5);
}

function buildRealtimeActionPrompt(payload: RealtimeOverlayAction) {
  const trigger = getRealtimeTriggerName(payload.action);
  const actionInstruction = buildRealtimeActionInstruction(payload);
  return [
    `TRIGGER: ${trigger}`,
    payload.recentTranscript ? `Konteks transcript interviewer terbaru:\n${payload.recentTranscript}` : "",
    payload.latestQuestion ? `Pertanyaan atau fokus terbaru:\n${payload.latestQuestion}` : "",
    payload.triggerText ? `Input user/keyword: ${payload.triggerText}` : "",
    "Jawab berdasarkan konteks transcript lengkap, bukan hanya potongan kalimat terakhir.",
    actionInstruction
  ].filter(Boolean).join("\n");
}

function buildRealtimeActionInstruction(payload: RealtimeOverlayAction) {
  if (payload.action === "answer") {
    return [
      "Output untuk BANTU_JAWAB wajib berupa jawaban kandidat yang siap dibaca langsung.",
      "Format wajib 3-5 bullet, satu bullet per baris, maksimal satu kalimat per bullet.",
      "Tulis dengan sudut pandang saya/kandidat, bukan saran untuk menjawab.",
      "Jangan tulis label BANTU_JAWAB.",
      "Jangan pakai kalimat instruksi seperti jelaskan, tekankan, sampaikan, sebutkan, atau kamu bisa."
    ].join("\n");
  }

  if (payload.action === "followup") {
    return [
      "Output untuk BANTU_FOLLOWUP wajib berupa 2-3 pertanyaan follow-up yang siap diucapkan kandidat.",
      "Format wajib satu pertanyaan per baris.",
      "Tulis langsung sebagai kalimat tanya.",
      "Jangan pakai instruksi seperti tanyakan, minta, atau kamu bisa bertanya."
    ].join("\n");
  }

  if (payload.action === "explain") {
    return [
      "Output untuk JELASKAN_MAKSUDNYA berisi maksud interviewer secara singkat dan angle jawaban terbaik.",
      "Format 2-3 bullet pendek.",
      "Boleh berupa penjelasan, tapi tetap ringkas dan langsung membantu kandidat menjawab."
    ].join("\n");
  }

  if (payload.action === "keyword") {
    return [
      "Output untuk EXPLAIN_KEYWORD berisi arti keyword singkat dan satu kalimat siap pakai untuk jawaban interview.",
      "Format 2 bullet: arti singkat, lalu kalimat siap pakai.",
      "Jangan melebar menjadi jawaban penuh kecuali keyword memang membutuhkan konteks."
    ].join("\n");
  }

  return [
    "Ikuti permintaan user.",
    "Kalau user meminta jawaban, tulis jawaban siap dibaca.",
    "Kalau user meminta penjelasan, jelaskan singkat dan actionable."
  ].join("\n");
}

function getRealtimeTriggerName(action: RealtimeOverlayAction["action"]) {
  if (action === "answer") return "BANTU_JAWAB";
  if (action === "followup") return "BANTU_FOLLOWUP";
  if (action === "explain") return "JELASKAN_MAKSUDNYA";
  if (action === "keyword") return "EXPLAIN_KEYWORD";
  return "ASK";
}

function getRealtimeActionTitle(payload: RealtimeOverlayAction) {
  if (payload.action === "answer") return "Bantu Jawab";
  if (payload.action === "followup") return "Bantu Follow-up";
  if (payload.action === "explain") return "Jelaskan Maksudnya";
  if (payload.action === "keyword") return `Keyword: ${payload.triggerText || "Keyword"}`;
  return "Ask";
}

function extractRealtimeResponseText(event: Record<string, unknown>) {
  const response = event.response && typeof event.response === "object" ? event.response as Record<string, unknown> : {};
  const output = Array.isArray(response.output) ? response.output : [];
  return output.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const content = Array.isArray((item as Record<string, unknown>).content) ? (item as Record<string, unknown>).content as unknown[] : [];
    return content.flatMap((part) => {
      if (!part || typeof part !== "object") return [];
      const record = part as Record<string, unknown>;
      const text = typeof record.text === "string"
        ? record.text
        : typeof record.transcript === "string"
          ? record.transcript
          : "";
      return text ? [text] : [];
    });
  }).join("").trim();
}

function buildDummyResponse(type: string, triggerText: string | undefined, context: OverlayContext): HelpResponse {
  const label = triggerText || type;
  if (type === "followup") {
    return {
      title: "Bantu Follow-up",
      kind: "help",
      points: [
        "Tanyakan metric utama yang paling diprioritaskan interviewer untuk role ini.",
        "Minta contoh masalah nyata yang sedang dihadapi tim.",
        "Hubungkan follow-up ke pengalaman kamu yang paling relevan."
      ]
    };
  }

  if (type === "explain") {
    return {
      title: "Jelaskan Maksudnya",
      kind: "help",
      points: [
        "Interviewer ingin melihat apakah kamu paham konteks bisnis, bukan hanya istilah teknis.",
        "Jawaban yang kuat menyebut problem, pendekatan, metric, dan trade-off.",
        "Hindari jawaban terlalu umum tanpa contoh konkret."
      ]
    };
  }

  return {
    title: type === "keyword" ? `Keyword: ${label}` : type === "ask" ? "Ask" : "Bantu Jawab",
    kind: "help",
    points: [
      `Mulai dari konteks role ${context.roleTitle || "ini"} dan kebutuhan ${context.companyName || "company"}.`,
      "Berikan struktur: problem, pendekatan, hasil yang diukur, lalu pembelajaran.",
      "Akhiri dengan contoh singkat agar jawaban terasa grounded dan tidak generik."
    ]
  };
}

function buildDummyTranscript(context: OverlayContext) {
  return [
    `Interview ${context.stageType || "HR"} untuk ${context.companyName || "company"} - ${context.roleTitle || "role"}.`,
    "Dummy transcript: interviewer menanyakan pengalaman relevan dan cara menjelaskan impact."
  ].join("\n");
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

function buildKeywordSourceText(latestQuestion: string, recentTranscript: string) {
  const normalizedQuestion = latestQuestion.trim();
  const transcriptSegments = recentTranscript
    .split(/\n+/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .slice(-4);
  const parts = [...transcriptSegments, normalizedQuestion].filter(Boolean);
  return Array.from(new Set(parts)).join("\n").trim();
}

function buildLocalRuntimeKeywords(question: string, context: OverlayContext, sourceText = question) {
  const profile = context.realtimeContext?.domainProfile;
  if (!profile) {
    return [];
  }

  const questionTokens = tokenizeText(question);
  const sourceTokens = tokenizeText(sourceText);
  if (!questionTokens.size && !sourceTokens.size) {
    return [];
  }

  const contextConcepts = uniqueKeywords([
    profile.primaryDomain,
    profile.nicheDescription,
    ...profile.seedConcepts,
    ...profile.inScopeConcepts,
    ...(context.realtimeContext?.applicationContext.roleRequirements || []),
    ...(context.realtimeContext?.stageContext.focus || [])
  ]);

  const contextTokens = tokenizeText(contextConcepts.join(" "));
  const outOfScopeHit = profile.outOfScopeConcepts.some((concept) => scoreConcept(concept, sourceText, sourceTokens) >= 3);
  const contextHit = contextConcepts.some((concept) => {
    const questionScore = questionTokens.size ? scoreConcept(concept, question, questionTokens) : 0;
    const sourceScore = sourceTokens.size ? scoreConcept(concept, sourceText, sourceTokens) : 0;
    return questionScore >= 1 || sourceScore >= 2;
  });
  if (outOfScopeHit && !contextHit) {
    return [];
  }

  const questionCandidates = buildQuestionKeywordCandidates(question, questionTokens, contextTokens, 2);
  const sourceCandidates = buildQuestionKeywordCandidates(sourceText, sourceTokens, contextTokens, 1);
  const scoredConcepts = contextConcepts
    .map((concept) => ({
      term: compactKeyword(concept),
      score: scoreConcept(concept, question, questionTokens) * 2 + scoreConcept(concept, sourceText, sourceTokens)
    }))
    .filter((item) => item.score >= 2)
    .sort((left, right) => right.score - left.score)
    .map((item) => item.term);

  const keywords = uniqueKeywords([...questionCandidates, ...sourceCandidates, ...scoredConcepts]).slice(0, 3);
  if (keywords.length) {
    return keywords;
  }

  if (contextHit || isDomainRelatedText(question, context) || isDomainRelatedText(sourceText, context)) {
    return contextConcepts.slice(0, 3).map(compactKeyword);
  }

  return [];
}

function scoreConcept(concept: string, question: string, questionTokens: Set<string>) {
  const normalizedConcept = concept.trim().toLowerCase();
  if (!normalizedConcept) {
    return 0;
  }

  const conceptTokens = tokenizeText(normalizedConcept);
  let score = 0;
  for (const token of conceptTokens) {
    if (questionTokens.has(token)) {
      score += token.length >= 5 ? 2 : 1;
    }
  }

  const normalizedQuestion = question.trim().toLowerCase();
  if (normalizedQuestion.includes(normalizedConcept) || normalizedConcept.includes(normalizedQuestion)) {
    score += 4;
  }

  return score;
}

function buildQuestionKeywordCandidates(question: string, questionTokens: Set<string>, contextTokens: Set<string>, questionWeight: number) {
  const normalizedQuestion = question
    .replace(/[?!.,;:()"'`]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const rawTokens = normalizedQuestion.split(" ").filter(Boolean);
  const candidateMap = new Map<string, number>();

  for (let start = 0; start < rawTokens.length; start += 1) {
    for (let size = 1; size <= 4; size += 1) {
      const phraseTokens = rawTokens.slice(start, start + size);
      if (phraseTokens.length !== size) {
        continue;
      }

      const normalizedTokens = phraseTokens
        .map((token) => normalizeToken(token))
        .filter((token) => token && questionTokens.has(token));
      if (!normalizedTokens.length || normalizedTokens.length !== phraseTokens.length) {
        continue;
      }

      const keyword = compactKeyword(toKeywordLabel(phraseTokens));
      const overlapScore = normalizedTokens.filter((token) => contextTokens.has(token)).length;
      const specificityScore = normalizedTokens.reduce((score, token) => score + (token.length >= 5 ? 1 : 0), 0);
      const acronymScore = phraseTokens.some((token) => /^[A-Z0-9]{2,}$/.test(token)) ? 2 : 0;
      const sizeScore = size > 1 ? size : 0;
      const score = overlapScore * 3 + specificityScore + acronymScore + sizeScore + questionWeight;

      if (score >= 3) {
        candidateMap.set(keyword, Math.max(candidateMap.get(keyword) || 0, score));
      }
    }
  }

  return [...candidateMap.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].length - right[0].length)
    .map(([keyword]) => keyword);
}

function toKeywordLabel(tokens: string[]) {
  return tokens
    .join(" ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\b(Ai|Ml|Llm|Api|Sql|Nlp|Cv|Jd)\b/g, (term) => term.toUpperCase());
}

function normalizeToken(token: string) {
  return token.toLowerCase().replace(/[^a-z0-9]+/gi, "").trim();
}

function tokenizeText(text: string) {
  const stopwords = new Set([
    "yang", "dan", "atau", "untuk", "dengan", "dari", "pada", "dalam", "kamu", "saya", "apa", "apakah",
    "bagaimana", "kenapa", "mengapa", "bisa", "the", "and", "or", "for", "with", "from", "this", "that",
    "how", "what", "why", "can", "could", "would", "should", "jelaskan", "ceritakan", "menurut", "kalau",
    "jika", "saat", "itu", "ini", "nya", "paling", "cocok", "pilih", "memilih", "gunakan", "pakai",
    "terkait", "tentang", "about", "tell", "me", "please", "use", "using", "choose", "related"
  ]);

  return new Set(text
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !stopwords.has(token)));
}

function uniqueKeywords(items: string[]) {
  const seen = new Set<string>();
  return items.flatMap((item) => {
    const keyword = compactKeyword(item);
    const key = keyword.toLowerCase();
    if (!keyword || seen.has(key)) {
      return [];
    }

    seen.add(key);
    return [keyword];
  });
}

function compactKeyword(value: string) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 38) {
    return trimmed;
  }

  return `${trimmed.slice(0, 35).trim()}...`;
}

function looksLikeInterviewerQuestion(text: string) {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (normalized.includes("?")) {
    return true;
  }

  return /^(apa|apakah|bagaimana|kenapa|mengapa|kapan|di mana|seberapa|jelaskan|ceritakan|how|what|why|when|where|can|could|do|did|have|tell me)\b/.test(normalized);
}

function isDomainRelatedText(text: string, context: OverlayContext) {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  const domainTerms = [
    context.domainLabel,
    context.realtimeContext?.domainProfile.primaryDomain,
    context.realtimeContext?.domainProfile.nicheDescription,
    ...(context.realtimeContext?.domainProfile.seedConcepts || []),
    ...(context.realtimeContext?.domainProfile.inScopeConcepts || [])
  ];

  const normalizedTerms = domainTerms.flatMap((term) => {
    const normalizedTerm = term?.trim().toLowerCase();
    return normalizedTerm && normalizedTerm.length >= 4 ? [normalizedTerm] : [];
  });

  return normalizedTerms.some((term) => normalized.includes(term));
}

function deriveQuestionFromTranscriptEvent(
  event: OverlayTranscriptEvent | undefined,
  context: OverlayContext
) {
  if (!event || event.speaker === "candidate" || event.speaker === "system") {
    return "";
  }

  const explicitQuestion = event.detectedQuestion?.trim();
  if (explicitQuestion && isRelevantTranscriptText(explicitQuestion, context)) {
    return explicitQuestion;
  }

  const transcriptText = event.transcriptText?.trim();
  if (!transcriptText) {
    return "";
  }

  const segments = transcriptText
    .split(/[\n\r]+|(?<=[?.!])\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    if (segment && looksLikeInterviewerQuestion(segment) && isRelevantTranscriptText(segment, context)) {
      return segment;
    }
  }

  const trailingSegment = segments.at(-1) || transcriptText;
  if (isRelevantTranscriptText(trailingSegment, context) && trailingSegment.length >= 24) {
    return trailingSegment;
  }

  return "";
}

function deriveQuestionFromTranscriptText(transcriptText: string, context: OverlayContext) {
  const segments = transcriptText
    .split(/[\n\r]+|(?<=[?.!])\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    if (segment && looksLikeInterviewerQuestion(segment) && isRelevantTranscriptText(segment, context)) {
      return segment;
    }
  }

  const trailingSegment = segments.at(-1) || transcriptText;
  if (isRelevantTranscriptText(trailingSegment, context) && trailingSegment.length >= 24) {
    return trailingSegment;
  }

  return undefined;
}

function deriveContextFromTranscriptWindow(recentTranscript: string, latestSegment: string, context: OverlayContext) {
  const directQuestion = deriveQuestionFromTranscriptText(latestSegment, context);
  if (directQuestion && directQuestion.length >= 48) {
    return directQuestion;
  }

  const windowText = recentTranscript.trim();
  if (!windowText) {
    return directQuestion;
  }

  const segments = windowText
    .split(/[\n\r]+|(?<=[?.!])\s+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment && isRelevantTranscriptText(segment, context));
  const focusedWindow = segments.slice(-4).join(" ").trim();

  if (directQuestion && focusedWindow && !focusedWindow.includes(directQuestion)) {
    return `${focusedWindow} ${directQuestion}`.trim();
  }

  return focusedWindow || directQuestion;
}

function isLikelyTranscriptNoise(text: string) {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  const noiseSignals = [
    "sponsored",
    "apply now",
    "base44",
    "budgeting app",
    "skip ad",
    "lewati iklan"
  ];

  return noiseSignals.some((signal) => normalized.includes(signal));
}

function isRelevantTranscriptText(text: string, context: OverlayContext) {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  const adSignals = [
    "sponsored",
    "apply now",
    "start building",
    "save you",
    "look.",
    "budgeting app",
    "base44",
    "promo",
    "iklan"
  ];
  if (adSignals.some((signal) => normalized.includes(signal))) {
    return false;
  }

  if (isDomainRelatedText(text, context)) {
    return true;
  }

  const genericInterviewSignals = [
    "role",
    "posisi",
    "pengalaman",
    "project",
    "proyek",
    "jelaskan",
    "ceritakan",
    "bagaimana",
    "kenapa",
    "mengapa",
    "approach",
    "pendekatan",
    "tantangan",
    "impact",
    "hasil",
    "explain",
    "tell me",
    "how would",
    "why would"
  ];

  return genericInterviewSignals.some((signal) => normalized.includes(signal));
}
