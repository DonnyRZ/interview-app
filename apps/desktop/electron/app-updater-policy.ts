export type DesktopUpdaterStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "waiting-for-meeting"
  | "restarting"
  | "error";

export type DesktopUpdaterState = {
  status: DesktopUpdaterStatus;
  currentVersion: string;
  availableVersion?: string;
  progressPercent?: number;
  message?: string;
};

export function canDownloadDesktopUpdate(state: DesktopUpdaterState) {
  return Boolean(state.availableVersion)
    && (state.status === "available" || state.status === "error");
}

export function canInstallDesktopUpdate(state: DesktopUpdaterState) {
  return state.status === "ready" || state.status === "waiting-for-meeting";
}

export function downloadedDesktopUpdateStatus(meetingActive: boolean): DesktopUpdaterStatus {
  return meetingActive ? "waiting-for-meeting" : "ready";
}

export function canCheckForDesktopUpdate(state: DesktopUpdaterState) {
  return state.status !== "downloading"
    && state.status !== "ready"
    && state.status !== "waiting-for-meeting"
    && state.status !== "restarting";
}

export function clampDesktopUpdateProgress(percent: number) {
  if (!Number.isFinite(percent)) return 0;
  return Math.max(0, Math.min(100, Math.round(percent)));
}
