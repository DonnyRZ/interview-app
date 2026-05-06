/// <reference types="vite/client" />

type InterviewAudioInputDevice = {
  deviceId: string;
  label: string;
  kind: "audioinput";
  isDefault: boolean;
};

type SystemAudioSupport = {
  supported: boolean;
  helperExists: boolean;
  helperPath: string;
  message: string;
};

type SystemAudioProbeEvent = {
  type: string;
  status: string;
  level: number;
  peak?: number;
  message: string;
};

type OverlayTranscriptEvent = {
  transcriptText: string;
  detectedQuestion?: string;
  speaker?: "interviewer" | "candidate" | "system";
  isFinal?: boolean;
  capturedAt?: string;
};

type RealtimeOverlayAction = {
  requestId: number;
  action: "answer" | "followup" | "explain" | "keyword" | "ask";
  latestQuestion?: string;
  triggerText?: string;
};

type RealtimeOverlayEvent =
  | { type: "status"; status: string; message: string }
  | { type: "response_started"; requestId: number; title: string }
  | { type: "response_delta"; requestId: number; delta: string }
  | { type: "response_done"; requestId: number; text: string }
  | { type: "error"; requestId?: number; message: string }
  | { type: "transcript_delta"; transcriptText: string }
  | { type: "transcript_completed"; transcriptText: string; detectedQuestion?: string }
  | { type: string; [key: string]: unknown };

interface Window {
  interviewDesktop?: {
    platform: NodeJS.Platform;
    listAudioInputDevices?: () => Promise<InterviewAudioInputDevice[]>;
    checkSystemAudioSupport?: () => Promise<SystemAudioSupport>;
    startSystemAudioProbe?: () => Promise<{ ok: boolean; message?: string }>;
    stopSystemAudioProbe?: () => Promise<{ ok: boolean; message?: string }>;
    onSystemAudioProbeEvent?: (callback: (payload: SystemAudioProbeEvent) => void) => () => void;
    openOverlay?: (context: unknown) => Promise<unknown>;
    updateOverlayContext?: (context: unknown) => Promise<unknown>;
    pushOverlayTranscript?: (event: OverlayTranscriptEvent) => Promise<unknown>;
    sendRealtimeAction?: (payload: RealtimeOverlayAction) => Promise<{ ok: boolean; message?: string }>;
    closeOverlay?: () => Promise<unknown>;
    getOverlayContext?: () => Promise<unknown>;
    resizeOverlay?: (mode: "mini" | "expanded" | "response") => Promise<unknown>;
    startOverlayDrag?: (point: { screenX: number; screenY: number }) => Promise<unknown>;
    stopOverlayDrag?: () => Promise<unknown>;
    endOverlayInterview?: (payload: unknown) => Promise<unknown>;
    onOverlayContextUpdated?: (callback: (payload: unknown) => void) => () => void;
    onRealtimeOverlayEvent?: (callback: (payload: RealtimeOverlayEvent) => void) => () => void;
    onOverlayInterviewEnded?: (callback: (payload: unknown) => void) => () => void;
  };
}
