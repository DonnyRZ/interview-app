export type SystemAudioCaptureErrorCode =
  | "unsupported"
  | "permission-denied"
  | "audio-track-missing"
  | "capture-unavailable"
  | "unknown";

export class SystemAudioCaptureError extends Error {
  constructor(
    readonly code: SystemAudioCaptureErrorCode,
    message: string
  ) {
    super(message);
    this.name = "SystemAudioCaptureError";
  }
}

export type ActiveSystemAudioCapture = {
  audioTrackLabel: string;
  getLevel: () => number;
  subscribePcm16: (callback: (chunk: Uint8Array) => void) => () => void;
  onEnded: (callback: () => void) => () => void;
  stop: () => Promise<void>;
};

type ExtendedDisplayMediaStreamOptions = DisplayMediaStreamOptions & {
  selfBrowserSurface?: "include" | "exclude";
  systemAudio?: "include" | "exclude";
  windowAudio?: "exclude" | "system" | "window";
};

type AudioCaptureMetrics = {
  startedAt: number;
  lastReportedAt: number;
  capturedChunks: number;
  capturedBytes: number;
  activeChunks: number;
  silentChunks: number;
  sentChunks: number;
  sentBytes: number;
};

type Pcm16PrebufferEntry = {
  chunk: Uint8Array;
  level: number;
};

type Pcm16SenderState = {
  prebuffer: Pcm16PrebufferEntry[];
  sending: boolean;
  tailChunksRemaining: number;
};

type Pcm16Subscriber = {
  callback: (chunk: Uint8Array) => void;
  sender: Pcm16SenderState;
};

const pcm16BytesPerSecond = 24_000 * 2;
const audioMetricsReportIntervalMs = 60_000;
const audioInstrumentationSignalThreshold = 0.025;
const audioSenderSignalThreshold = 0.015;
const maxPrebufferChunks = 20;
const audioSendTailChunks = 8;

export function supportsSystemAudioCapture() {
  return Boolean(
    navigator.mediaDevices
    && typeof navigator.mediaDevices.getDisplayMedia === "function"
    && typeof window.AudioContext === "function"
  );
}

export async function startSystemAudioCapture(): Promise<ActiveSystemAudioCapture> {
  if (!supportsSystemAudioCapture()) {
    throw new SystemAudioCaptureError(
      "unsupported",
      "Browser ini belum mendukung system audio capture. Gunakan Chrome terbaru di Windows."
    );
  }

  let stream: MediaStream;
  try {
    const options: ExtendedDisplayMediaStreamOptions = {
      video: {
        displaySurface: "monitor",
        frameRate: { max: 1 }
      },
      audio: true,
      selfBrowserSurface: "exclude",
      systemAudio: "include",
      windowAudio: "system"
    };
    stream = await navigator.mediaDevices.getDisplayMedia(options);
  } catch (error) {
    throw mapCaptureError(error);
  }

  const audioTrack = stream.getAudioTracks()[0];
  if (!audioTrack) {
    stopTracks(stream);
    throw new SystemAudioCaptureError(
      "audio-track-missing",
      "System audio tidak ikut dibagikan. Pilih Entire Screen dan aktifkan Share system audio."
    );
  }

  const audioContext = new AudioContext();
  const audioStream = new MediaStream([audioTrack]);
  let sourceNode: MediaStreamAudioSourceNode;
  let analyserNode: AnalyserNode;
  let processorNode: AudioWorkletNode;
  let silentGainNode: GainNode;
  const endedCallbacks = new Set<() => void>();
  const pcm16Callbacks = new Set<Pcm16Subscriber>();
  const pcm16Prebuffer: Pcm16PrebufferEntry[] = [];
  const metrics: AudioCaptureMetrics = {
    startedAt: performance.now(),
    lastReportedAt: performance.now(),
    capturedChunks: 0,
    capturedBytes: 0,
    activeChunks: 0,
    silentChunks: 0,
    sentChunks: 0,
    sentBytes: 0
  };
  let stopped = false;

  try {
    sourceNode = audioContext.createMediaStreamSource(audioStream);
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 1024;
    analyserNode.smoothingTimeConstant = 0.78;
    await audioContext.audioWorklet.addModule(`${import.meta.env.BASE_URL}audio/pcm16-processor.js`);
    processorNode = new AudioWorkletNode(audioContext, "orviko-pcm16-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1]
    });
    silentGainNode = audioContext.createGain();
    silentGainNode.gain.value = 0;
    sourceNode.connect(analyserNode);
    sourceNode.connect(processorNode);
    processorNode.connect(silentGainNode);
    silentGainNode.connect(audioContext.destination);
    processorNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      if (stopped) return;
      const chunk = new Uint8Array(event.data);
      const level = measurePcm16Level(chunk);
      if (import.meta.env.DEV) {
        observeAudioCaptureMetrics(metrics, chunk, level);
      }
      const entry = { chunk, level };
      pushPcm16Prebuffer(pcm16Prebuffer, entry);
      for (const subscriber of pcm16Callbacks) {
        emitPcm16WithSilencePolicy(subscriber, entry, import.meta.env.DEV ? metrics : null);
      }
      if (import.meta.env.DEV) {
        maybeReportAudioCaptureMetrics(metrics);
      }
    };
    processorNode.port.postMessage({ type: "active", value: true });
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }
  } catch (error) {
    stopTracks(stream);
    if (audioContext.state !== "closed") {
      await audioContext.close().catch(() => undefined);
    }
    throw new SystemAudioCaptureError(
      "capture-unavailable",
      error instanceof Error ? error.message : "Web Audio tidak dapat memproses system audio."
    );
  }
  const samples = new Uint8Array(analyserNode.fftSize);

  const handleTrackEnded = () => {
    if (stopped) return;
    for (const callback of endedCallbacks) callback();
  };

  for (const track of stream.getTracks()) {
    track.addEventListener("ended", handleTrackEnded, { once: true });
  }

  return {
    audioTrackLabel: audioTrack.label || "System audio",
    getLevel() {
      analyserNode.getByteTimeDomainData(samples);
      let squareSum = 0;
      for (const sample of samples) {
        const normalized = (sample - 128) / 128;
        squareSum += normalized * normalized;
      }
      return Math.min(1, Math.sqrt(squareSum / samples.length) * 3.2);
    },
    subscribePcm16(callback) {
      const subscriber: Pcm16Subscriber = {
        callback,
        sender: createPcm16SenderState()
      };
      for (const entry of pcm16Prebuffer) {
        emitPcm16WithSilencePolicy(subscriber, entry, import.meta.env.DEV ? metrics : null);
      }
      pcm16Callbacks.add(subscriber);
      return () => {
        pcm16Callbacks.delete(subscriber);
      };
    },
    onEnded(callback) {
      endedCallbacks.add(callback);
      return () => endedCallbacks.delete(callback);
    },
    async stop() {
      if (stopped) return;
      stopped = true;
      endedCallbacks.clear();
      pcm16Callbacks.clear();
      pcm16Prebuffer.length = 0;
      processorNode.port.postMessage({ type: "active", value: false });
      for (const track of stream.getTracks()) {
        track.removeEventListener("ended", handleTrackEnded);
      }
      stopTracks(stream);
      sourceNode.disconnect();
      analyserNode.disconnect();
      processorNode.port.onmessage = null;
      processorNode.disconnect();
      silentGainNode.disconnect();
      if (audioContext.state !== "closed") {
        await audioContext.close().catch(() => undefined);
      }
    }
  };
}

function createPcm16SenderState(): Pcm16SenderState {
  return {
    prebuffer: [],
    sending: false,
    tailChunksRemaining: 0
  };
}

function pushPcm16Prebuffer(prebuffer: Pcm16PrebufferEntry[], entry: Pcm16PrebufferEntry) {
  prebuffer.push({ chunk: entry.chunk.slice(), level: entry.level });
  if (prebuffer.length > maxPrebufferChunks) prebuffer.shift();
}

function emitPcm16WithSilencePolicy(
  subscriber: Pcm16Subscriber,
  entry: Pcm16PrebufferEntry,
  metrics: AudioCaptureMetrics | null
) {
  const sender = subscriber.sender;
  const active = isAudioChunkActiveForSending(entry.level);
  pushPcm16Prebuffer(sender.prebuffer, entry);

  if (active && !sender.sending) {
    sender.sending = true;
    sender.tailChunksRemaining = audioSendTailChunks;
    const bufferedEntries = sender.prebuffer.splice(0, sender.prebuffer.length);
    for (const bufferedEntry of bufferedEntries) {
      emitPcm16Chunk(subscriber, bufferedEntry.chunk, metrics);
    }
    return;
  }

  if (!sender.sending) {
    return;
  }

  emitPcm16Chunk(subscriber, entry.chunk, metrics);
  if (active) {
    sender.tailChunksRemaining = audioSendTailChunks;
    return;
  }

  sender.tailChunksRemaining -= 1;
  if (sender.tailChunksRemaining <= 0) {
    sender.sending = false;
    sender.prebuffer.length = 0;
  }
}

function emitPcm16Chunk(subscriber: Pcm16Subscriber, chunk: Uint8Array, metrics: AudioCaptureMetrics | null) {
  observeAudioSentMetrics(metrics, chunk);
  subscriber.callback(chunk);
}

function isAudioChunkActiveForSending(level: number) {
  return level >= audioSenderSignalThreshold;
}

function observeAudioCaptureMetrics(metrics: AudioCaptureMetrics, chunk: Uint8Array, level: number) {
  metrics.capturedChunks += 1;
  metrics.capturedBytes += chunk.byteLength;
  if (level >= audioInstrumentationSignalThreshold) {
    metrics.activeChunks += 1;
  } else {
    metrics.silentChunks += 1;
  }
}

function observeAudioSentMetrics(metrics: AudioCaptureMetrics | null, chunk: Uint8Array) {
  if (!metrics) return;
  metrics.sentChunks += 1;
  metrics.sentBytes += chunk.byteLength;
}

function maybeReportAudioCaptureMetrics(metrics: AudioCaptureMetrics) {
  const now = performance.now();
  if (now - metrics.lastReportedAt < audioMetricsReportIntervalMs) return;
  const capturedAudioSeconds = metrics.capturedBytes / pcm16BytesPerSecond;
  const sentAudioSeconds = metrics.sentBytes / pcm16BytesPerSecond;
  const suppressedChunks = Math.max(0, metrics.capturedChunks - metrics.sentChunks);
  const suppressedSilentSeconds = Math.max(0, capturedAudioSeconds - sentAudioSeconds);
  const elapsedSeconds = (now - metrics.startedAt) / 1_000;
  console.info("[orviko:web-audio-metrics]", {
    elapsedSeconds: Math.round(elapsedSeconds),
    chunks: metrics.capturedChunks,
    audioSeconds: Math.round(sentAudioSeconds),
    capturedAudioSeconds: Math.round(capturedAudioSeconds),
    sentAudioSeconds: Math.round(sentAudioSeconds),
    suppressedSilentSeconds: Math.round(suppressedSilentSeconds),
    sentChunks: metrics.sentChunks,
    suppressedChunks,
    activeChunks: metrics.activeChunks,
    silentChunks: metrics.silentChunks,
    activeRatio: metrics.capturedChunks ? Number((metrics.activeChunks / metrics.capturedChunks).toFixed(3)) : 0,
    sendRatio: metrics.capturedChunks ? Number((metrics.sentChunks / metrics.capturedChunks).toFixed(3)) : 0
  });
  metrics.lastReportedAt = now;
}

function measurePcm16Level(chunk: Uint8Array) {
  const samples = new Int16Array(chunk.buffer, chunk.byteOffset, Math.floor(chunk.byteLength / Int16Array.BYTES_PER_ELEMENT));
  if (samples.length === 0) return 0;
  let squareSum = 0;
  for (const sample of samples) {
    const normalized = sample / 32768;
    squareSum += normalized * normalized;
  }
  return Math.min(1, Math.sqrt(squareSum / samples.length) * 3.2);
}

function measureAudioLevel(analyserNode: AnalyserNode, samples: Uint8Array<ArrayBuffer>) {
  analyserNode.getByteTimeDomainData(samples);
  let squareSum = 0;
  for (const sample of samples) {
    const normalized = (sample - 128) / 128;
    squareSum += normalized * normalized;
  }
  return Math.min(1, Math.sqrt(squareSum / samples.length) * 3.2);
}

function stopTracks(stream: MediaStream) {
  for (const track of stream.getTracks()) track.stop();
}

function mapCaptureError(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "AbortError") {
      return new SystemAudioCaptureError(
        "permission-denied",
        "Akses capture dibatalkan atau tidak diizinkan."
      );
    }
    if (error.name === "NotReadableError") {
      return new SystemAudioCaptureError(
        "capture-unavailable",
        "Windows atau browser tidak dapat membuka sumber capture yang dipilih."
      );
    }
  }

  return new SystemAudioCaptureError(
    "unknown",
    error instanceof Error ? error.message : "System audio capture gagal dimulai."
  );
}
