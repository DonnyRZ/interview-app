import { useCallback, useEffect, useRef, useState } from "react";
import {
  startSystemAudioCapture,
  supportsSystemAudioCapture,
  SystemAudioCaptureError,
  type ActiveSystemAudioCapture
} from "./system-audio-capture.js";

export type SystemAudioStatus =
  | "idle"
  | "requesting"
  | "silent"
  | "listening"
  | "ended"
  | "unsupported"
  | "error";

type SystemAudioState = {
  status: SystemAudioStatus;
  message: string;
  level: number;
  trackLabel?: string;
};

const idleState: SystemAudioState = {
  status: "idle",
  message: "System audio belum terhubung.",
  level: 0
};

export function useSystemAudio() {
  const [state, setState] = useState<SystemAudioState>(() => supportsSystemAudioCapture()
    ? idleState
    : {
        status: "unsupported",
        message: "Browser ini belum mendukung system audio capture.",
        level: 0
      });
  const captureRef = useRef<ActiveSystemAudioCapture | null>(null);
  const unsubscribeEndedRef = useRef<(() => void) | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  const cleanupCapture = useCallback(async () => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    unsubscribeEndedRef.current?.();
    unsubscribeEndedRef.current = null;
    const capture = captureRef.current;
    captureRef.current = null;
    await capture?.stop();
  }, []);

  const stop = useCallback(async () => {
    requestIdRef.current += 1;
    await cleanupCapture();
    if (mountedRef.current) setState(idleState);
  }, [cleanupCapture]);

  const start = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    await cleanupCapture();
    if (!mountedRef.current || requestIdRef.current !== requestId) return;

    setState({
      status: "requesting",
      message: "Menunggu pilihan sumber audio dari Chrome...",
      level: 0
    });

    try {
      const capture = await startSystemAudioCapture();
      if (!mountedRef.current || requestIdRef.current !== requestId) {
        await capture.stop();
        return;
      }

      captureRef.current = capture;
      setState({
        status: "silent",
        message: "Terhubung. Menunggu suara dari output Windows...",
        level: 0,
        trackLabel: capture.audioTrackLabel
      });

      unsubscribeEndedRef.current = capture.onEnded(() => {
        if (!mountedRef.current || requestIdRef.current !== requestId) return;
        requestIdRef.current += 1;
        void cleanupCapture();
        setState({
          status: "ended",
          message: "System audio berhenti dibagikan.",
          level: 0
        });
      });

      let previousUpdate = 0;
      const updateLevel = (timestamp: number) => {
        if (!mountedRef.current || requestIdRef.current !== requestId || captureRef.current !== capture) return;
        if (timestamp - previousUpdate >= 80) {
          previousUpdate = timestamp;
          const level = capture.getLevel();
          const listening = level >= 0.025;
          setState({
            status: listening ? "listening" : "silent",
            message: listening
              ? "System audio aktif dan signal terdeteksi."
              : "Terhubung. Menunggu suara dari output Windows...",
            level,
            trackLabel: capture.audioTrackLabel
          });
        }
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };
      animationFrameRef.current = requestAnimationFrame(updateLevel);
    } catch (error) {
      if (!mountedRef.current || requestIdRef.current !== requestId) return;
      setState({
        status: error instanceof SystemAudioCaptureError && error.code === "unsupported"
          ? "unsupported"
          : "error",
        message: error instanceof Error ? error.message : "System audio capture gagal dimulai.",
        level: 0
      });
    }
  }, [cleanupCapture]);

  const subscribePcm16 = useCallback((callback: (chunk: Uint8Array) => void) => {
    const capture = captureRef.current;
    if (!capture) return () => undefined;
    return capture.subscribePcm16(callback);
  }, []);

  const hasSignal = useCallback(() => {
    const capture = captureRef.current;
    return Boolean(capture && capture.getLevel() >= 0.025);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      void cleanupCapture();
    };
  }, [cleanupCapture]);

  return {
    ...state,
    start,
    stop,
    subscribePcm16,
    hasSignal,
    supported: state.status !== "unsupported",
    active: state.status === "silent" || state.status === "listening"
  };
}
