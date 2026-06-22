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
  const pcm16Callbacks = new Set<(chunk: Uint8Array) => void>();
  let stopped = false;

  try {
    sourceNode = audioContext.createMediaStreamSource(audioStream);
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 1024;
    analyserNode.smoothingTimeConstant = 0.78;
    await audioContext.audioWorklet.addModule("/audio/pcm16-processor.js");
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
      if (stopped || !pcm16Callbacks.size) return;
      const chunk = new Uint8Array(event.data);
      for (const callback of pcm16Callbacks) callback(chunk);
    };
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
      pcm16Callbacks.add(callback);
      processorNode.port.postMessage({ type: "active", value: true });
      return () => {
        pcm16Callbacks.delete(callback);
        if (!pcm16Callbacks.size) processorNode.port.postMessage({ type: "active", value: false });
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
