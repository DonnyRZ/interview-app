import { app, BrowserWindow, ipcMain, screen, shell } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rendererDevUrl = process.env.VITE_DEV_SERVER_URL;
const apiBaseUrl = process.env.VITE_API_BASE_URL || "http://127.0.0.1:4000";
const preloadPath = path.join(currentDir, "preload.cjs");
const loopbackProbePath = path.join(currentDir, "../native/windows-loopback/bin/WasapiLoopbackProbe.exe");
const overlaySizes = {
  mini: { width: 430, height: 72 },
  expanded: { width: 560, height: 440 },
  response: { width: 900, height: 440 }
};

type RealtimeStatus = "idle" | "connecting" | "listening" | "responding" | "error" | "closed";

type RuntimeWebSocketEvent = {
  data?: unknown;
  message?: string;
};

type RuntimeWebSocket = {
  readyState: number;
  send: (data: string) => void;
  close: () => void;
  addEventListener: (type: string, listener: (event: RuntimeWebSocketEvent) => void) => void;
};

type RuntimeWebSocketConstructor = new (url: string, protocols?: string[]) => RuntimeWebSocket;

type RealtimeActionPayload = {
  requestId?: number;
  action?: "answer" | "followup" | "explain" | "keyword" | "ask";
  latestQuestion?: string;
  triggerText?: string;
};

const websocketOpenState = 1;

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let overlayContext: unknown = null;
let overlayDragTimer: NodeJS.Timeout | null = null;
let overlayDragOffset: { x: number; y: number } | null = null;
let currentOverlaySize = overlaySizes.mini;
let overlayCloseHandled = false;
let systemAudioProbeProcess: ChildProcessWithoutNullStreams | null = null;
let systemAudioProbeBuffer = "";
let realtimeSocket: RuntimeWebSocket | null = null;
let realtimeAudioProcess: ChildProcessWithoutNullStreams | null = null;
let realtimeAudioBuffer = "";
let realtimeStatus: RealtimeStatus = "idle";
let realtimeResponseText = "";
let realtimeResponseRequestId = 0;

function sanitizeTranscriptEvent(event: unknown) {
  if (!event || typeof event !== "object") {
    return null;
  }

  const payload = event as Record<string, unknown>;
  const transcriptText = typeof payload.transcriptText === "string" ? payload.transcriptText.trim() : "";
  const detectedQuestion = typeof payload.detectedQuestion === "string" ? payload.detectedQuestion.trim() : "";
  const speaker = payload.speaker === "interviewer" || payload.speaker === "candidate" || payload.speaker === "system"
    ? payload.speaker
    : "interviewer";
  const isFinal = typeof payload.isFinal === "boolean" ? payload.isFinal : true;
  const capturedAt = typeof payload.capturedAt === "string" && payload.capturedAt.trim()
    ? payload.capturedAt.trim()
    : new Date().toISOString();

  if (!transcriptText && !detectedQuestion) {
    return null;
  }

  return {
    transcriptText,
    detectedQuestion,
    speaker,
    isFinal,
    capturedAt
  };
}

function mergeOverlayContext(update: unknown) {
  const base = overlayContext && typeof overlayContext === "object" ? overlayContext as Record<string, unknown> : {};
  const patch = update && typeof update === "object" ? update as Record<string, unknown> : {};
  overlayContext = {
    ...base,
    ...patch
  };
}

function emitRealtimeOverlayEvent(event: Record<string, unknown>) {
  overlayWindow?.webContents.send("overlay:realtime-event", event);
}

function setRealtimeStatus(status: RealtimeStatus, message: string) {
  realtimeStatus = status;
  mergeOverlayContext({
    realtimeStatus: status,
    realtimeMessage: message
  });
  overlayWindow?.webContents.send("overlay:context-updated", overlayContext);
  emitRealtimeOverlayEvent({
    type: "status",
    status,
    message
  });
}

async function startRealtimeSession(context: unknown) {
  const realtimeContext = readRealtimeContext(context);
  stopRealtimeSession(false);

  if (!realtimeContext) {
    setRealtimeStatus("error", "Realtime context belum tersedia.");
    return;
  }

  setRealtimeStatus("connecting", "Menghubungkan ke gpt-realtime-mini...");

  try {
    const token = await fetchRealtimeClientSecret(realtimeContext);
    const WebSocketConstructor = (globalThis as unknown as { WebSocket?: RuntimeWebSocketConstructor }).WebSocket;
    if (!WebSocketConstructor) {
      throw new Error("Runtime WebSocket tidak tersedia di Electron main process.");
    }

    const socket = new WebSocketConstructor(
      `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(token.model)}`,
      [
        "realtime",
        `openai-insecure-api-key.${token.clientSecret}`
      ]
    );

    realtimeSocket = socket;
    socket.addEventListener("open", () => {
      if (realtimeSocket !== socket) return;
      setRealtimeStatus("listening", "Realtime listening via system audio.");
      startRealtimeAudioStream();
    });
    socket.addEventListener("message", (event) => {
      if (realtimeSocket !== socket) return;
      handleRealtimeServerMessage(event.data);
    });
    socket.addEventListener("error", () => {
      if (realtimeSocket !== socket) return;
      stopRealtimeAudioStream();
      setRealtimeStatus("error", "Realtime session gagal. gpt-realtime-mini tidak tersambung.");
      emitRealtimeOverlayEvent({
        type: "error",
        message: "Realtime session gagal. gpt-realtime-mini tidak tersambung."
      });
    });
    socket.addEventListener("close", () => {
      if (realtimeSocket !== socket) return;
      realtimeSocket = null;
      stopRealtimeAudioStream();
      if (realtimeStatus !== "error") {
        setRealtimeStatus("closed", "Realtime session tertutup.");
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Realtime session gagal dibuat.";
    stopRealtimeSession(false);
    setRealtimeStatus("error", message);
    emitRealtimeOverlayEvent({
      type: "error",
      message
    });
  }
}

function stopRealtimeSession(emitClosed = true) {
  stopRealtimeAudioStream();
  const socket = realtimeSocket;
  realtimeSocket = null;
  if (socket) {
    try {
      socket.close();
    } catch {
      // Closing is best-effort during app/window shutdown.
    }
  }

  realtimeResponseText = "";
  realtimeResponseRequestId = 0;
  if (emitClosed) {
    setRealtimeStatus("closed", "Realtime session tertutup.");
  } else {
    realtimeStatus = "idle";
  }
}

async function fetchRealtimeClientSecret(realtimeContext: Record<string, unknown>) {
  const response = await fetch(`${apiBaseUrl}/interviews/realtime/client-secret`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      realtimeContext
    })
  });
  const payload = await response.json() as {
    model?: string;
    clientSecret?: string;
    expiresAt?: number;
    message?: string;
  };

  if (!response.ok) {
    throw new Error(payload.message || `Realtime client secret failed with ${response.status}`);
  }

  if (payload.model !== "gpt-realtime-mini" || !payload.clientSecret || !payload.expiresAt) {
    throw new Error("Realtime client secret response invalid atau bukan gpt-realtime-mini.");
  }

  return {
    model: payload.model,
    clientSecret: payload.clientSecret,
    expiresAt: payload.expiresAt
  };
}

function startRealtimeAudioStream() {
  if (process.platform !== "win32") {
    setRealtimeStatus("error", "System audio loopback saat ini hanya tersedia di Windows.");
    return;
  }

  if (!fs.existsSync(loopbackProbePath)) {
    setRealtimeStatus("error", "WASAPI helper belum tersedia. Jalankan build:native:windows.");
    return;
  }

  if (realtimeAudioProcess) {
    return;
  }

  stopSystemAudioProbe();
  realtimeAudioBuffer = "";
  realtimeAudioProcess = spawn(loopbackProbePath, ["stream", "--chunk-ms", "40"], {
    windowsHide: true
  });

  realtimeAudioProcess.stdout.on("data", (chunk: Buffer) => {
    realtimeAudioBuffer += chunk.toString("utf8");
    const lines = realtimeAudioBuffer.split(/\r?\n/);
    realtimeAudioBuffer = lines.pop() || "";
    for (const line of lines) {
      handleRealtimeAudioLine(line);
    }
  });

  realtimeAudioProcess.stderr.on("data", (chunk: Buffer) => {
    emitRealtimeOverlayEvent({
      type: "error",
      message: chunk.toString("utf8").trim() || "WASAPI stream stderr output."
    });
  });

  realtimeAudioProcess.on("error", (error) => {
    realtimeAudioProcess = null;
    realtimeAudioBuffer = "";
    setRealtimeStatus("error", error.message);
  });

  realtimeAudioProcess.on("exit", (code) => {
    if (realtimeAudioBuffer.trim()) {
      handleRealtimeAudioLine(realtimeAudioBuffer);
    }
    realtimeAudioProcess = null;
    realtimeAudioBuffer = "";
    if (code !== 0 && realtimeStatus !== "closed" && realtimeStatus !== "idle") {
      setRealtimeStatus("error", `WASAPI audio stream exited with code ${code ?? "unknown"}.`);
    }
  });
}

function stopRealtimeAudioStream() {
  if (realtimeAudioProcess) {
    realtimeAudioProcess.kill();
    realtimeAudioProcess = null;
  }
  realtimeAudioBuffer = "";
}

function handleRealtimeAudioLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const event = JSON.parse(trimmed) as { type?: string; audio?: string; message?: string };
    if (event.type === "audio_chunk" && event.audio) {
      sendRealtimeClientEvent({
        type: "input_audio_buffer.append",
        audio: event.audio
      });
      return;
    }

    if (event.type === "error" && event.message) {
      setRealtimeStatus("error", event.message);
    }
  } catch {
    emitRealtimeOverlayEvent({
      type: "log",
      message: trimmed
    });
  }
}

function handleRealtimeServerMessage(data: unknown) {
  const text = typeof data === "string"
    ? data
    : data instanceof Buffer
      ? data.toString("utf8")
      : "";

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
    emitRealtimeOverlayEvent({ type: "speech_started" });
    return;
  }

  if (type === "input_audio_buffer.speech_stopped") {
    emitRealtimeOverlayEvent({ type: "speech_stopped" });
    return;
  }

  if (type === "conversation.item.input_audio_transcription.delta") {
    const delta = typeof event.delta === "string" ? event.delta : "";
    if (delta) {
      emitRealtimeOverlayEvent({
        type: "transcript_delta",
        transcriptText: delta
      });
    }
    return;
  }

  if (type === "conversation.item.input_audio_transcription.completed") {
    const transcriptText = typeof event.transcript === "string" ? event.transcript.trim() : "";
    if (transcriptText) {
      const detectedQuestion = looksLikeQuestion(transcriptText) ? transcriptText : undefined;
      const transcriptEvent = {
        transcriptText,
        detectedQuestion,
        speaker: "interviewer",
        isFinal: true,
        capturedAt: new Date().toISOString()
      };
      mergeOverlayContext({
        latestTranscriptEvent: transcriptEvent
      });
      overlayWindow?.webContents.send("overlay:context-updated", overlayContext);
      emitRealtimeOverlayEvent({
        type: "transcript_completed",
        transcriptText,
        detectedQuestion
      });
    }
    return;
  }

  if (type === "response.output_text.delta") {
    const delta = typeof event.delta === "string" ? event.delta : "";
    if (delta) {
      realtimeResponseText += delta;
      emitRealtimeOverlayEvent({
        type: "response_delta",
        requestId: realtimeResponseRequestId,
        delta
      });
    }
    return;
  }

  if (type === "response.output_text.done") {
    const textDone = typeof event.text === "string" ? event.text.trim() : "";
    if (textDone && !realtimeResponseText.trim()) {
      realtimeResponseText = textDone;
    }
    return;
  }

  if (type === "response.done") {
    const textDone = extractRealtimeResponseText(event) || realtimeResponseText.trim();
    emitRealtimeOverlayEvent({
      type: "response_done",
      requestId: realtimeResponseRequestId,
      text: textDone
    });
    realtimeResponseText = "";
    realtimeResponseRequestId = 0;
    setRealtimeStatus("listening", "Realtime listening via system audio.");
    return;
  }

  if (type === "error") {
    const error = event.error && typeof event.error === "object" ? event.error as Record<string, unknown> : {};
    const message = typeof error.message === "string" ? error.message : "Realtime API error.";
    setRealtimeStatus("error", message);
    emitRealtimeOverlayEvent({
      type: "error",
      requestId: realtimeResponseRequestId || undefined,
      message
    });
  }
}

function sendRealtimeClientEvent(event: Record<string, unknown>) {
  if (!realtimeSocket || realtimeSocket.readyState !== websocketOpenState) {
    return false;
  }

  realtimeSocket.send(JSON.stringify(event));
  return true;
}

function sendRealtimeAction(payload: unknown) {
  const actionPayload = sanitizeRealtimeActionPayload(payload);
  if (!actionPayload) {
    return { ok: false, message: "Invalid realtime action payload." };
  }

  if (!realtimeSocket || realtimeSocket.readyState !== websocketOpenState) {
    const message = "Realtime session belum aktif.";
    emitRealtimeOverlayEvent({
      type: "error",
      requestId: actionPayload.requestId,
      message
    });
    return { ok: false, message };
  }

  if (realtimeStatus === "responding") {
    sendRealtimeClientEvent({ type: "response.cancel" });
  }

  realtimeResponseRequestId = actionPayload.requestId || Date.now();
  realtimeResponseText = "";
  setRealtimeStatus("responding", "Realtime sedang membuat bantuan...");
  emitRealtimeOverlayEvent({
    type: "response_started",
    requestId: realtimeResponseRequestId,
    title: getRealtimeActionTitle(actionPayload)
  });

  sendRealtimeClientEvent({
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "user",
      content: [
        {
          type: "input_text",
          text: buildRealtimeActionPrompt(actionPayload)
        }
      ]
    }
  });
  sendRealtimeClientEvent({
    type: "response.create",
    response: {
      output_modalities: ["text"],
      max_output_tokens: 500
    }
  });

  return { ok: true };
}

function sanitizeRealtimeActionPayload(payload: unknown): Required<Pick<RealtimeActionPayload, "requestId" | "action">> & RealtimeActionPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as RealtimeActionPayload;
  const actions = new Set(["answer", "followup", "explain", "keyword", "ask"]);
  if (!candidate.action || !actions.has(candidate.action)) {
    return null;
  }

  return {
    requestId: typeof candidate.requestId === "number" ? candidate.requestId : Date.now(),
    action: candidate.action,
    latestQuestion: typeof candidate.latestQuestion === "string" ? candidate.latestQuestion.trim() : "",
    triggerText: typeof candidate.triggerText === "string" ? candidate.triggerText.trim() : ""
  };
}

function buildRealtimeActionPrompt(payload: RealtimeActionPayload) {
  const trigger = getRealtimeTriggerName(payload.action);
  return [
    `TRIGGER: ${trigger}`,
    payload.latestQuestion ? `Pertanyaan interviewer terbaru: ${payload.latestQuestion}` : "",
    payload.triggerText ? `Input user/keyword: ${payload.triggerText}` : "",
    "Berikan output text saja, ringkas, actionable, dan siap dipakai kandidat.",
    "Jangan membuat seolah-olah kandidat punya pengalaman yang tidak ada di context."
  ].filter(Boolean).join("\n");
}

function getRealtimeTriggerName(action: RealtimeActionPayload["action"]) {
  if (action === "answer") return "BANTU_JAWAB";
  if (action === "followup") return "BANTU_FOLLOWUP";
  if (action === "explain") return "JELASKAN_MAKSUDNYA";
  if (action === "keyword") return "EXPLAIN_KEYWORD";
  return "ASK";
}

function getRealtimeActionTitle(payload: RealtimeActionPayload) {
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

function readRealtimeContext(source: unknown) {
  if (!source || typeof source !== "object") {
    return null;
  }

  const context = source as Record<string, unknown>;
  return context.realtimeContext && typeof context.realtimeContext === "object"
    ? context.realtimeContext as Record<string, unknown>
    : null;
}

function looksLikeQuestion(text: string) {
  const normalized = text.trim().toLowerCase();
  return normalized.includes("?") || /^(apa|apakah|bagaimana|kenapa|mengapa|kapan|di mana|seberapa|jelaskan|ceritakan|how|what|why|when|where|can|could|do|did|have|tell me)\b/.test(normalized);
}

function rendererUrlFor(searchParams = "") {
  if (rendererDevUrl) {
    return `${rendererDevUrl}${searchParams}`;
  }

  return path.join(currentDir, "../dist/index.html");
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    title: "Interview Assistant",
    backgroundColor: "#f4f6fa",
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (rendererDevUrl) {
    await mainWindow.loadURL(rendererUrlFor());
    mainWindow.webContents.openDevTools({ mode: "detach" });
    return;
  }

  await mainWindow.loadFile(rendererUrlFor());
}

async function createOverlayWindow(context: unknown) {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    const previousContext = readOverlayEndContext();
    const nextContext = readOverlayEndContext(context);
    if (previousContext.interviewRoundId && previousContext.interviewRoundId !== nextContext.interviewRoundId) {
      mainWindow?.webContents.send("overlay:interview-ended", {
        ...previousContext,
        transcriptText: "Interview otomatis ditutup karena round baru dimulai."
      });
    }

    overlayContext = context;
    currentOverlaySize = overlaySizes.mini;
    overlayCloseHandled = false;
    lockOverlaySize(currentOverlaySize);
    overlayWindow.focus();
    overlayWindow.webContents.send("overlay:context-updated", overlayContext);
    void startRealtimeSession(overlayContext);
    return;
  }

  overlayContext = context;
  currentOverlaySize = overlaySizes.mini;
  overlayCloseHandled = false;

  overlayWindow = new BrowserWindow({
    width: overlaySizes.mini.width,
    height: overlaySizes.mini.height,
    minWidth: overlaySizes.mini.width,
    minHeight: overlaySizes.mini.height,
    maxWidth: overlaySizes.mini.width,
    maxHeight: overlaySizes.mini.height,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    title: "Interview Assistant Overlay",
    backgroundColor: "#00000000",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  overlayWindow.setAlwaysOnTop(true, "screen-saver");
  lockOverlaySize(currentOverlaySize);

  overlayWindow.once("ready-to-show", () => {
    overlayWindow?.show();
  });

  overlayWindow.on("closed", () => {
    stopOverlayDrag();
    stopRealtimeSession();
    if (!overlayCloseHandled) {
      mainWindow?.webContents.send("overlay:interview-ended", {
        ...readOverlayEndContext(),
        transcriptText: "Overlay tertutup sebelum tombol End Interview ditekan."
      });
    }
    overlayWindow = null;
    overlayCloseHandled = false;
  });

  if (rendererDevUrl) {
    await overlayWindow.loadURL(rendererUrlFor("?window=overlay"));
    void startRealtimeSession(overlayContext);
    return;
  }

  await overlayWindow.loadFile(rendererUrlFor(), {
    search: "window=overlay"
  });
  void startRealtimeSession(overlayContext);
}

function registerOverlayIpc() {
  ipcMain.handle("overlay:open", async (_event, context: unknown) => {
    await createOverlayWindow(context);
    return { ok: true };
  });

  ipcMain.handle("overlay:update-context", (_event, context: unknown) => {
    mergeOverlayContext(context);
    overlayWindow?.webContents.send("overlay:context-updated", overlayContext);
    return { ok: true };
  });

  ipcMain.handle("overlay:push-transcript", (_event, event: unknown) => {
    const sanitizedEvent = sanitizeTranscriptEvent(event);
    if (!sanitizedEvent) {
      return { ok: false };
    }

    mergeOverlayContext({
      latestTranscriptEvent: sanitizedEvent
    });
    overlayWindow?.webContents.send("overlay:context-updated", overlayContext);
    return { ok: true };
  });

  ipcMain.handle("overlay:send-realtime-action", (_event, payload: unknown) => sendRealtimeAction(payload));

  ipcMain.handle("overlay:close", () => {
    stopRealtimeSession();
    overlayWindow?.close();
    overlayWindow = null;
    return { ok: true };
  });

  ipcMain.handle("overlay:get-context", () => overlayContext);

  ipcMain.handle("overlay:resize", (_event, mode: "mini" | "expanded" | "response") => {
    if (!overlayWindow || overlayWindow.isDestroyed()) {
      return { ok: false };
    }

    currentOverlaySize = overlaySizes[mode];
    lockOverlaySize(currentOverlaySize);

    return { ok: true };
  });

  ipcMain.handle("overlay:start-drag", (_event, point: { screenX: number; screenY: number }) => {
    if (!overlayWindow || overlayWindow.isDestroyed()) {
      return { ok: false };
    }

    lockOverlaySize(currentOverlaySize);
    const bounds = overlayWindow.getBounds();
    overlayDragOffset = {
      x: point.screenX - bounds.x,
      y: point.screenY - bounds.y
    };

    if (overlayDragTimer) {
      clearInterval(overlayDragTimer);
    }

    overlayDragTimer = setInterval(() => {
      if (!overlayWindow || overlayWindow.isDestroyed() || !overlayDragOffset) return;
      const cursor = screen.getCursorScreenPoint();
      overlayWindow.setBounds({
        x: Math.round(cursor.x - overlayDragOffset.x),
        y: Math.round(cursor.y - overlayDragOffset.y),
        width: currentOverlaySize.width,
        height: currentOverlaySize.height
      }, false);
    }, 16);

    return { ok: true };
  });

  ipcMain.handle("overlay:stop-drag", () => {
    stopOverlayDrag();
    return { ok: true };
  });

  ipcMain.handle("overlay:end-interview", (_event, payload: unknown) => {
    overlayCloseHandled = true;
    stopRealtimeSession();
    mainWindow?.webContents.send("overlay:interview-ended", payload);
    overlayWindow?.close();
    overlayWindow = null;
    return { ok: true };
  });
}

function registerSystemAudioIpc() {
  ipcMain.handle("system-audio:check-support", () => {
    const supported = process.platform === "win32";
    const helperExists = fs.existsSync(loopbackProbePath);
    return {
      supported,
      helperExists,
      helperPath: loopbackProbePath,
      message: !supported
        ? "System audio loopback saat ini hanya didukung untuk Windows."
        : helperExists
          ? "Windows WASAPI loopback helper tersedia."
          : "Windows WASAPI loopback helper belum ter-build."
    };
  });

  ipcMain.handle("system-audio:start-probe", () => {
    if (process.platform !== "win32") {
      return { ok: false, message: "System audio loopback hanya tersedia di Windows." };
    }

    if (!fs.existsSync(loopbackProbePath)) {
      return { ok: false, message: "WASAPI helper belum tersedia. Jalankan build:native:windows." };
    }

    if (systemAudioProbeProcess) {
      return { ok: true, message: "System audio probe already running." };
    }

    systemAudioProbeBuffer = "";
    systemAudioProbeProcess = spawn(loopbackProbePath, ["probe", "--milliseconds", "3500", "--interval", "120"], {
      windowsHide: true
    });

    systemAudioProbeProcess.stdout.on("data", (chunk: Buffer) => {
      systemAudioProbeBuffer += chunk.toString("utf8");
      const lines = systemAudioProbeBuffer.split(/\r?\n/);
      systemAudioProbeBuffer = lines.pop() || "";
      for (const line of lines) {
        emitSystemAudioProbeLine(line);
      }
    });

    systemAudioProbeProcess.stderr.on("data", (chunk: Buffer) => {
      emitSystemAudioProbeEvent({
        type: "error",
        status: "error",
        level: 0,
        peak: 0,
        message: chunk.toString("utf8").trim() || "WASAPI helper stderr output."
      });
    });

    systemAudioProbeProcess.on("error", (error) => {
      emitSystemAudioProbeEvent({
        type: "error",
        status: "error",
        level: 0,
        peak: 0,
        message: error.message
      });
      systemAudioProbeProcess = null;
      systemAudioProbeBuffer = "";
    });

    systemAudioProbeProcess.on("exit", (code) => {
      if (systemAudioProbeBuffer.trim()) {
        emitSystemAudioProbeLine(systemAudioProbeBuffer);
      }
      systemAudioProbeProcess = null;
      systemAudioProbeBuffer = "";
      if (code !== 0) {
        emitSystemAudioProbeEvent({
          type: "exit",
          status: "error",
          level: 0,
          peak: 0,
          message: `WASAPI helper exited with code ${code ?? "unknown"}.`
        });
      }
    });

    return { ok: true, message: "System audio probe started." };
  });

  ipcMain.handle("system-audio:stop-probe", () => {
    stopSystemAudioProbe();
    emitSystemAudioProbeEvent({
      type: "result",
      status: "stopped",
      level: 0,
      peak: 0,
      message: "System audio probe stopped."
    });
    return { ok: true };
  });
}

function stopSystemAudioProbe() {
  if (systemAudioProbeProcess) {
    systemAudioProbeProcess.kill();
    systemAudioProbeProcess = null;
  }
  systemAudioProbeBuffer = "";
}

function emitSystemAudioProbeLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    emitSystemAudioProbeEvent(JSON.parse(trimmed) as Record<string, unknown>);
  } catch {
    emitSystemAudioProbeEvent({
      type: "log",
      status: "checking",
      level: 0,
      peak: 0,
      message: trimmed
    });
  }
}

function emitSystemAudioProbeEvent(event: Record<string, unknown>) {
  mainWindow?.webContents.send("system-audio:probe-event", event);
}

function stopOverlayDrag() {
  if (overlayDragTimer) {
    clearInterval(overlayDragTimer);
    overlayDragTimer = null;
  }
  overlayDragOffset = null;
}

function readOverlayEndContext(source: unknown = overlayContext) {
  if (!source || typeof source !== "object") {
    return {};
  }

  const context = source as { interviewRoundId?: unknown; applicationId?: unknown };
  return {
    interviewRoundId: typeof context.interviewRoundId === "string" ? context.interviewRoundId : undefined,
    applicationId: typeof context.applicationId === "string" ? context.applicationId : undefined
  };
}

function lockOverlaySize(size: { width: number; height: number }) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  overlayWindow.setResizable(false);
  overlayWindow.setMinimumSize(size.width, size.height);
  overlayWindow.setMaximumSize(size.width, size.height);
  overlayWindow.setBounds({
    ...overlayWindow.getBounds(),
    width: size.width,
    height: size.height
  }, false);
}

app.whenReady().then(async () => {
  registerOverlayIpc();
  registerSystemAudioIpc();
  await createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  stopRealtimeSession();
  stopSystemAudioProbe();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
