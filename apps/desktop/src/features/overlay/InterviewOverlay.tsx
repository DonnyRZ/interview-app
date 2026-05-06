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
    return window.interviewDesktop?.onOverlayContextUpdated?.(applyContext);
  }, []);

  useEffect(() => {
    return window.interviewDesktop?.onRealtimeOverlayEvent?.((event) => {
      if (event.type === "status") {
        const nextStatus = typeof event.status === "string" ? event.status : "";
        const nextMessage = typeof event.message === "string" ? event.message : "";
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

    const requestKey = `${context.interviewRoundId || "draft"}::${latestQuestion.trim()}`;
    if (runtimeKeywordRequestRef.current === requestKey) {
      return;
    }

    runtimeKeywordRequestRef.current = requestKey;
    setRuntimeKeywordStatus("loading");
    syncRuntimeKeywords([]);

    const nextKeywords = buildLocalRuntimeKeywords(latestQuestion, context);
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

    const response = await window.interviewDesktop?.sendRealtimeAction?.({
      requestId,
      action: type as RealtimeOverlayAction["action"],
      latestQuestion,
      triggerText
    });

    if (!response?.ok) {
      if (!isCurrentRequest(requestId)) return;
      setActiveResponse(buildRealtimeUnavailableResponse(response?.message || context.realtimeMessage));
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

  if (context.realtimeStatus === "listening") {
    return "Realtime listening";
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

  return cleaned
    .split(/\n+/)
    .map((line) => line.replace(/^\s*[-*•]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 6);
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

function buildLocalRuntimeKeywords(question: string, context: OverlayContext) {
  const profile = context.realtimeContext?.domainProfile;
  if (!profile) {
    return [];
  }

  const questionTokens = tokenizeText(question);
  if (!questionTokens.size) {
    return [];
  }

  const concepts = uniqueKeywords([
    profile.primaryDomain,
    profile.nicheDescription,
    ...profile.seedConcepts,
    ...profile.inScopeConcepts,
    ...(context.realtimeContext?.applicationContext.roleRequirements || []),
    ...(context.realtimeContext?.stageContext.focus || [])
  ]);

  const outOfScopeHit = profile.outOfScopeConcepts.some((concept) => scoreConcept(concept, question, questionTokens) >= 3);
  const domainHit = concepts.some((concept) => scoreConcept(concept, question, questionTokens) >= 2);
  if (outOfScopeHit && !domainHit) {
    return [];
  }

  const scoredConcepts = concepts
    .map((concept) => ({
      term: compactKeyword(concept),
      score: scoreConcept(concept, question, questionTokens)
    }))
    .filter((item) => item.score >= 2)
    .sort((left, right) => right.score - left.score)
    .map((item) => item.term);

  const broadConcepts = buildBroadKeywordCandidates(questionTokens, concepts);
  const keywords = uniqueKeywords([...scoredConcepts, ...broadConcepts]).slice(0, 3);
  if (keywords.length) {
    return keywords;
  }

  if (domainHit || isDomainRelatedText(question, context)) {
    return concepts.slice(0, 3).map(compactKeyword);
  }

  return [];
}

function buildBroadKeywordCandidates(questionTokens: Set<string>, concepts: string[]) {
  const domainText = concepts.join(" ").toLowerCase();
  const groups = [
    {
      keys: ["ai", "artificial", "intelligence", "kecerdasan", "llm", "neural"],
      domainPattern: /\b(ai|artificial|intelligence|machine|learning|ml|deep|neural|model|data)\b/i,
      conceptPattern: /\b(ai|artificial|intelligence|machine|learning|ml|deep|neural|llm|model)\b/i,
      fallback: "AI fundamentals"
    },
    {
      keys: ["machine", "learning", "model", "algoritma", "algorithm", "regression", "classification", "rnn", "lstm", "gbm"],
      domainPattern: /\b(machine|learning|model|forecast|predict|prediction|data|feature|algorithm)\b/i,
      conceptPattern: /\b(machine|learning|model|forecast|predict|prediction|algorithm|rnn|lstm|gbm)\b/i,
      fallback: "Machine learning modeling"
    },
    {
      keys: ["data", "dataset", "feature", "fitur", "training", "metric", "evaluasi", "akurasi", "accuracy"],
      domainPattern: /\b(data|dataset|feature|metric|training|evaluation|model|analytics)\b/i,
      conceptPattern: /\b(data|dataset|feature|metric|training|evaluation|analytics)\b/i,
      fallback: "Data and feature strategy"
    },
    {
      keys: ["bisnis", "business", "process", "proses", "stakeholder", "product", "operational", "operasi"],
      domainPattern: /\b(role|business|process|stakeholder|product|operation|domain|customer|user)\b/i,
      conceptPattern: /\b(business|process|stakeholder|product|operation|domain|customer|user)\b/i,
      fallback: "Business domain context"
    },
    {
      keys: ["harga", "price", "market", "pasar", "makro", "macro", "economy", "economic", "berita", "news", "global", "dunia"],
      domainPattern: /\b(price|pricing|market|forecast|demand|supply|econom|macro|commodity|revenue|growth)\b/i,
      conceptPattern: /\b(price|pricing|market|forecast|demand|supply|econom|macro|commodity|revenue|growth)\b/i,
      fallback: "Market and external factors"
    }
  ];

  return groups.flatMap((group) => {
    const questionMatches = group.keys.some((key) => questionTokens.has(key));
    if (!questionMatches || !group.domainPattern.test(domainText)) {
      return [];
    }

    return [compactKeyword(concepts.find((concept) => group.conceptPattern.test(concept)) || group.fallback)];
  });
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

function tokenizeText(text: string) {
  const stopwords = new Set([
    "yang", "dan", "atau", "untuk", "dengan", "dari", "pada", "dalam", "kamu", "saya", "apa", "apakah",
    "bagaimana", "kenapa", "mengapa", "bisa", "the", "and", "or", "for", "with", "from", "this", "that",
    "how", "what", "why", "can", "could", "would", "should"
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
  if (explicitQuestion) {
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
    if (segment && looksLikeInterviewerQuestion(segment)) {
      return segment;
    }
  }

  const trailingSegment = segments.at(-1) || transcriptText;
  if (isDomainRelatedText(trailingSegment, context) && trailingSegment.length >= 24) {
    return trailingSegment;
  }

  return "";
}
