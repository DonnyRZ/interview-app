import { app, BrowserWindow, ipcMain, screen, shell } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getForcedConversationMode,
  isRealtimeActionName,
  type RealtimeActionName,
  type RealtimeConversationMode
} from "./realtime-action-contract.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rendererDevUrl = process.env.VITE_DEV_SERVER_URL;
const apiBaseUrl = process.env.VITE_API_BASE_URL || "http://127.0.0.1:4000";
const preloadPath = path.join(currentDir, "preload.cjs");
const devLoopbackProbePath = path.join(currentDir, "../native/windows-loopback/bin/WasapiLoopbackProbe.exe");
const packagedLoopbackProbePath = path.join(process.resourcesPath, "native", "windows-loopback", "WasapiLoopbackProbe.exe");
const loopbackProbePath = app.isPackaged ? packagedLoopbackProbePath : devLoopbackProbePath;
const overlaySizes = {
  mini: { width: 430, height: 72 },
  expanded: { width: 560, height: 440 },
  response: { width: 900, height: 440 }
};

type RealtimeStatus = "idle" | "connecting" | "connected" | "audio_waiting" | "listening" | "responding" | "error" | "closed";

type RealtimeActionPayload = {
  requestId?: number;
  action?: RealtimeActionName;
  latestQuestion?: string;
  recentTranscript?: string;
  triggerText?: string;
  conversationMode?: RealtimeConversationMode;
};

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let overlayContext: unknown = null;
let overlayDragTimer: NodeJS.Timeout | null = null;
let overlayDragOffset: { x: number; y: number } | null = null;
let currentOverlaySize = overlaySizes.mini;
let overlayCloseHandled = false;
let systemAudioProbeProcess: ChildProcessWithoutNullStreams | null = null;
let systemAudioProbeBuffer = "";
let realtimeAudioProcess: ChildProcessWithoutNullStreams | null = null;
let realtimeAudioBuffer = "";
let realtimeAudioHadHelperError = false;
let realtimeAudioRestartAttempts = 0;
let realtimeAudioRestartTimer: NodeJS.Timeout | null = null;
const realtimeAudioExpectedStops = new WeakSet<ChildProcessWithoutNullStreams>();
const realtimeAudioRestartDelaysMs = [500, 1500];
let realtimeStatus: RealtimeStatus = "idle";
let realtimeConnectPayload: { model: string; clientSecret: string; expiresAt: number } | null = null;

function mergeOverlayContext(update: unknown) {
  const base = overlayContext && typeof overlayContext === "object" ? overlayContext as Record<string, unknown> : {};
  const patch = update && typeof update === "object" ? update as Record<string, unknown> : {};
  const nextBase = { ...base };
  if (!Object.prototype.hasOwnProperty.call(patch, "latestTranscriptEvent")) {
    delete nextBase.latestTranscriptEvent;
  }

  overlayContext = {
    ...nextBase,
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

function setAudioCaptureStatus(status: string, message: string, deviceLabel?: string) {
  mergeOverlayContext({
    audioStatus: status,
    audioDeviceLabel: deviceLabel,
    audioSourceKind: "system-loopback",
    realtimeMessage: message
  });
  overlayWindow?.webContents.send("overlay:context-updated", overlayContext);
  emitRealtimeOverlayEvent({
    type: "audio_status",
    status,
    message,
    deviceLabel
  });
}

function isRealtimeActionTransportReady() {
  return realtimeStatus === "connected"
    || realtimeStatus === "audio_waiting"
    || realtimeStatus === "listening"
    || realtimeStatus === "responding";
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
    realtimeConnectPayload = token;
    emitRealtimeConnectPayload();
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
  realtimeAudioRestartAttempts = 0;
  realtimeConnectPayload = null;
  emitRealtimeOverlayEvent({ type: "disconnect" });
  if (emitClosed) {
    setRealtimeStatus("closed", "Realtime session tertutup.");
  } else {
    realtimeStatus = "idle";
  }
}

function emitRealtimeConnectPayload() {
  if (!realtimeConnectPayload) {
    return;
  }

  emitRealtimeOverlayEvent({
    type: "connect",
    model: realtimeConnectPayload.model,
    clientSecret: realtimeConnectPayload.clientSecret,
    expiresAt: realtimeConnectPayload.expiresAt
  });
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
    setRealtimeStatus("error", "Komponen audio meeting belum siap. Jalankan build:native:windows.");
    return;
  }

  if (realtimeAudioProcess) {
    return;
  }

  clearRealtimeAudioRestartTimer();
  stopSystemAudioProbe();
  realtimeAudioBuffer = "";
  realtimeAudioHadHelperError = false;
  setAudioCaptureStatus("waiting", "Mencari audio meeting dari active system output...");
  const audioProcess = spawn(loopbackProbePath, ["stream", "--chunk-ms", "40"], {
    windowsHide: true
  });
  realtimeAudioProcess = audioProcess;

  audioProcess.stdout.on("data", (chunk: Buffer) => {
    realtimeAudioBuffer += chunk.toString("utf8");
    const lines = realtimeAudioBuffer.split(/\r?\n/);
    realtimeAudioBuffer = lines.pop() || "";
    for (const line of lines) {
      handleRealtimeAudioLine(line);
    }
  });

  audioProcess.stderr.on("data", (chunk: Buffer) => {
    emitRealtimeOverlayEvent({
      type: "error",
      message: chunk.toString("utf8").trim() || "WASAPI stream stderr output."
    });
  });

  audioProcess.on("error", (error) => {
    if (realtimeAudioProcess === audioProcess) {
      realtimeAudioProcess = null;
    }
    realtimeAudioBuffer = "";
    setRealtimeStatus("error", getLoopbackHelperErrorMessage(error));
  });

  audioProcess.on("exit", (code, signal) => {
    if (realtimeAudioBuffer.trim()) {
      handleRealtimeAudioLine(realtimeAudioBuffer);
    }
    if (realtimeAudioProcess === audioProcess) {
      realtimeAudioProcess = null;
    }
    realtimeAudioBuffer = "";
    const expectedStop = realtimeAudioExpectedStops.has(audioProcess);
    if (expectedStop || realtimeAudioHadHelperError || code === 0 || realtimeStatus === "closed" || realtimeStatus === "idle") {
      return;
    }

    const exitDetails = formatRealtimeAudioExitDetails(code, signal);
    if (scheduleRealtimeAudioRestart(exitDetails)) {
      return;
    }

    setRealtimeStatus("error", `WASAPI audio stream exited unexpectedly (${exitDetails}).`);
  });
}

function getLoopbackHelperErrorMessage(error: NodeJS.ErrnoException) {
  const rawMessage = error.message || "";
  const blockedByPolicy = error.code === "EPERM"
    || rawMessage.toLowerCase().includes("blocked")
    || rawMessage.toLowerCase().includes("application control");

  if (blockedByPolicy) {
    return "System audio helper diblokir Windows Security. Untuk distribusi user, gunakan package Microsoft Store. Untuk QA lokal, jalankan dari dev mode atau packaged build internal yang sesuai policy Windows mesin ini.";
  }

  return rawMessage || "System audio helper gagal dijalankan.";
}

function stopRealtimeAudioStream() {
  clearRealtimeAudioRestartTimer();
  if (realtimeAudioProcess) {
    const audioProcess = realtimeAudioProcess;
    realtimeAudioExpectedStops.add(audioProcess);
    audioProcess.kill();
    realtimeAudioProcess = null;
  }
  realtimeAudioBuffer = "";
  realtimeAudioHadHelperError = false;
}

function clearRealtimeAudioRestartTimer() {
  if (realtimeAudioRestartTimer) {
    clearTimeout(realtimeAudioRestartTimer);
    realtimeAudioRestartTimer = null;
  }
}

function resetRealtimeAudioRestartAttempts() {
  realtimeAudioRestartAttempts = 0;
}

function canRestartRealtimeAudioStream() {
  return Boolean(realtimeConnectPayload)
    && realtimeStatus !== "idle"
    && realtimeStatus !== "closed"
    && realtimeStatus !== "error";
}

function scheduleRealtimeAudioRestart(exitDetails: string) {
  if (!canRestartRealtimeAudioStream() || realtimeAudioRestartAttempts >= realtimeAudioRestartDelaysMs.length) {
    return false;
  }

  const delayMs = realtimeAudioRestartDelaysMs[realtimeAudioRestartAttempts] ?? realtimeAudioRestartDelaysMs[realtimeAudioRestartDelaysMs.length - 1];
  realtimeAudioRestartAttempts += 1;
  setAudioCaptureStatus("waiting", `Audio meeting terputus sebentar (${exitDetails}). Mencoba menyambungkan ulang...`);
  realtimeAudioRestartTimer = setTimeout(() => {
    realtimeAudioRestartTimer = null;
    if (canRestartRealtimeAudioStream()) {
      startRealtimeAudioStream();
    }
  }, delayMs);
  return true;
}

function formatRealtimeAudioExitDetails(code: number | null, signal: NodeJS.Signals | null) {
  const codeText = code === null ? "null" : String(code);
  const signalText = signal || "none";
  return `code ${codeText}, signal ${signalText}`;
}

function handleRealtimeAudioLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const event = JSON.parse(trimmed) as {
      type?: string;
      status?: string;
      audio?: string;
      message?: string;
      deviceLabel?: string;
      deviceId?: string;
      sequence?: number;
      capturedAt?: string;
      streamState?: string;
    };
    if (event.type === "audio_chunk" && event.audio) {
      emitRealtimeOverlayEvent({
        type: "input_audio_buffer.append",
        audio: event.audio,
        sequence: event.sequence,
        capturedAt: event.capturedAt,
        deviceId: event.deviceId,
        deviceLabel: event.deviceLabel,
        streamState: event.streamState
      });
      return;
    }

    if (event.type === "selected_device") {
      resetRealtimeAudioRestartAttempts();
      const deviceLabel = typeof event.deviceLabel === "string" && event.deviceLabel.trim()
        ? event.deviceLabel.trim()
        : "active system output";
      setAudioCaptureStatus("ready", `Listening via ${deviceLabel}`, deviceLabel);
      setRealtimeStatus("listening", `Listening via ${deviceLabel}`);
      return;
    }

    if (event.type === "status" && event.status === "waiting_for_audio") {
      const message = event.message || "Mencari audio meeting dari active system output...";
      setAudioCaptureStatus("waiting", message);
      if (realtimeStatus !== "closed" && realtimeStatus !== "idle" && realtimeStatus !== "error") {
        setRealtimeStatus("connected", message);
      }
      return;
    }

    if (event.type === "level") {
      const deviceLabel = typeof event.deviceLabel === "string" && event.deviceLabel.trim()
        ? event.deviceLabel.trim()
        : "active system output";
      if (event.status === "ok") {
        resetRealtimeAudioRestartAttempts();
        setAudioCaptureStatus("ready", `Listening via ${deviceLabel}`, deviceLabel);
        setRealtimeStatus("listening", `Listening via ${deviceLabel}`);
      } else if (event.status === "silent") {
        const message = `Audio system sedang silent via ${deviceLabel}`;
        setAudioCaptureStatus("silent", message, deviceLabel);
        if (realtimeStatus === "listening") {
          setRealtimeStatus("connected", message);
        }
      } else if (event.status === "checking") {
        const message = `Mengecek audio system via ${deviceLabel}`;
        setAudioCaptureStatus("checking", message, deviceLabel);
        if (realtimeStatus === "listening") {
          setRealtimeStatus("connected", message);
        }
      }
      return;
    }

    if (event.type === "result" && event.status === "silent") {
      const message = event.message || "Audio belum tertangkap dari active system output.";
      setAudioCaptureStatus("waiting", message);
      if (realtimeStatus === "connecting" || realtimeStatus === "audio_waiting") {
        setRealtimeStatus("connected", message);
      }
      return;
    }

    if (event.type === "error" && event.message) {
      realtimeAudioHadHelperError = true;
      setRealtimeStatus("error", event.message);
    }
  } catch {
    emitRealtimeOverlayEvent({
      type: "log",
      message: trimmed
    });
  }
}

function sendRealtimeAction(payload: unknown) {
  const actionPayload = sanitizeRealtimeActionPayload(payload);
  if (!actionPayload) {
    return { ok: false, message: "Invalid realtime action payload." };
  }

  if (!isRealtimeActionTransportReady()) {
    const message = "Realtime session belum aktif.";
    emitRealtimeOverlayEvent({
      type: "error",
      requestId: actionPayload.requestId,
      message
    });
    return { ok: false, message };
  }

  emitRealtimeOverlayEvent({
    type: "client_action",
    payload: actionPayload
  });

  return { ok: true };
}

function sanitizeRealtimeActionPayload(payload: unknown): Required<Pick<RealtimeActionPayload, "requestId" | "action">> & RealtimeActionPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as RealtimeActionPayload;
  if (!isRealtimeActionName(candidate.action)) {
    return null;
  }
  const forcedConversationMode = getForcedConversationMode(candidate.action);

  return {
    requestId: typeof candidate.requestId === "number" ? candidate.requestId : Date.now(),
    action: candidate.action,
    latestQuestion: typeof candidate.latestQuestion === "string" ? candidate.latestQuestion.trim() : "",
    recentTranscript: typeof candidate.recentTranscript === "string" ? candidate.recentTranscript.trim() : "",
    triggerText: typeof candidate.triggerText === "string" ? candidate.triggerText.trim() : "",
    conversationMode: forcedConversationMode || (candidate.conversationMode === "qna" || candidate.conversationMode === "convo"
      ? candidate.conversationMode
      : "unknown")
  };
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
    title: "Orviko Meeting Assistant",
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
        transcriptText: "Sesi meeting otomatis ditutup karena sesi baru dimulai."
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
    title: "Orviko Meeting Overlay",
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
        transcriptText: "Overlay tertutup sebelum tombol End Meeting ditekan."
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

  ipcMain.handle("overlay:send-realtime-action", (_event, payload: unknown) => sendRealtimeAction(payload));

  ipcMain.handle("overlay:realtime-client-event", (_event, payload: unknown) => {
    const event = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    const type = typeof event.type === "string" ? event.type : "";
    const message = typeof event.message === "string" ? event.message : "";

    if (type === "ready") {
      emitRealtimeConnectPayload();
      return { ok: true };
    }

    if (type === "open") {
      setRealtimeStatus("connected", "Realtime tersambung. Mencari audio meeting dari active system output...");
      startRealtimeAudioStream();
      return { ok: true };
    }

    if (type === "responding") {
      setRealtimeStatus("responding", message || "Realtime sedang membuat bantuan...");
      return { ok: true };
    }

    if (type === "listening") {
      setRealtimeStatus("listening", message || "Realtime listening via system audio.");
      return { ok: true };
    }

    if (type === "error") {
      stopRealtimeAudioStream();
      setRealtimeStatus("error", message || "Realtime session gagal. gpt-realtime-mini tidak tersambung.");
      return { ok: true };
    }

    if (type === "closed") {
      stopRealtimeAudioStream();
      if (realtimeStatus !== "error") {
        setRealtimeStatus("closed", message || "Realtime session tertutup.");
      }
      return { ok: true };
    }

    return { ok: false, message: "Unknown realtime client event." };
  });

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
        ? "Pengecekan audio meeting hanya tersedia di Windows."
        : helperExists
          ? "Audio meeting siap dicek."
          : "Komponen audio meeting belum siap."
    };
  });

  ipcMain.handle("system-audio:start-probe", () => {
    if (process.platform !== "win32") {
      return { ok: false, message: "System audio loopback hanya tersedia di Windows." };
    }

    if (!fs.existsSync(loopbackProbePath)) {
      return { ok: false, message: "Komponen audio meeting belum siap. Jalankan build:native:windows." };
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
        message: chunk.toString("utf8").trim() || "Komponen audio meeting mengirim status error."
      });
    });

    systemAudioProbeProcess.on("error", (error) => {
      const message = getLoopbackHelperErrorMessage(error);
      emitSystemAudioProbeEvent({
        type: "error",
        status: "error",
        level: 0,
        peak: 0,
        message
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
          message: `Komponen audio meeting berhenti dengan kode ${code ?? "unknown"}.`
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
