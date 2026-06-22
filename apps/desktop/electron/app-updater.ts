import { app, type BrowserWindow, ipcMain } from "electron";
import electronUpdater from "electron-updater";
import {
  canCheckForDesktopUpdate,
  canDownloadDesktopUpdate,
  canInstallDesktopUpdate,
  clampDesktopUpdateProgress,
  downloadedDesktopUpdateStatus,
  type DesktopUpdaterState
} from "./app-updater-policy.js";

const { autoUpdater } = electronUpdater;

type DesktopUpdaterOptions = {
  getMainWindow: () => BrowserWindow | null;
  isMeetingActive: () => boolean;
};

const initialCheckDelayMs = 10_000;
const recurringCheckIntervalMs = 6 * 60 * 60 * 1_000;

let options: DesktopUpdaterOptions | null = null;
let state: DesktopUpdaterState = {
  status: "idle",
  currentVersion: app.getVersion()
};
let initialized = false;
let initialCheckTimer: NodeJS.Timeout | null = null;
let recurringCheckTimer: NodeJS.Timeout | null = null;

export function registerDesktopUpdater(nextOptions: DesktopUpdaterOptions) {
  options = nextOptions;
  if (initialized) return;
  initialized = true;

  ipcMain.handle("updater:get-state", () => state);
  ipcMain.handle("updater:download", async () => {
    if (!app.isPackaged) {
      return { ok: false, message: "Updater hanya aktif pada installer Orviko." };
    }

    if (canInstallDesktopUpdate(state)) {
      installDownloadedUpdateWhenSafe();
      return { ok: true };
    }

    if (!canDownloadDesktopUpdate(state)) {
      return { ok: false, message: "Update belum siap diunduh." };
    }

    setState({
      ...state,
      status: "downloading",
      progressPercent: 0,
      message: "Mengunduh update Orviko..."
    });

    try {
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (error) {
      setUpdaterError(error, "Download update gagal.");
      return { ok: false, message: readErrorMessage(error, "Download update gagal.") };
    }
  });

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.autoRunAppAfterInstall = true;
  autoUpdater.disableWebInstaller = true;

  autoUpdater.on("checking-for-update", () => {
    setState({
      status: "checking",
      currentVersion: app.getVersion(),
      message: "Memeriksa update Orviko..."
    });
  });

  autoUpdater.on("update-not-available", () => {
    setState({
      status: "idle",
      currentVersion: app.getVersion()
    });
  });

  autoUpdater.on("update-available", (info) => {
    setState({
      status: "available",
      currentVersion: app.getVersion(),
      availableVersion: info.version,
      message: `Orviko ${info.version} tersedia.`
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    setState({
      ...state,
      status: "downloading",
      progressPercent: clampDesktopUpdateProgress(progress.percent),
      message: "Mengunduh update Orviko..."
    });
  });

  autoUpdater.on("update-downloaded", (event) => {
    setState({
      status: downloadedDesktopUpdateStatus(Boolean(options?.isMeetingActive())),
      currentVersion: app.getVersion(),
      availableVersion: event.version,
      progressPercent: 100,
      message: options?.isMeetingActive()
        ? "Update siap dan akan dipasang setelah meeting selesai."
        : "Update siap dipasang."
    });
    installDownloadedUpdateWhenSafe();
  });

  autoUpdater.on("error", (error) => {
    setUpdaterError(error, "Updater Orviko mengalami kendala.");
  });
}

export function startDesktopUpdater() {
  if (!app.isPackaged || !initialized) return;

  initialCheckTimer = setTimeout(() => {
    void checkForUpdates();
  }, initialCheckDelayMs);
  initialCheckTimer.unref();

  recurringCheckTimer = setInterval(() => {
    void checkForUpdates();
  }, recurringCheckIntervalMs);
  recurringCheckTimer.unref();
}

export function installDownloadedUpdateWhenSafe() {
  if (!canInstallDesktopUpdate(state)) {
    return false;
  }

  if (options?.isMeetingActive()) {
    setState({
      ...state,
      status: "waiting-for-meeting",
      message: "Update siap dan akan dipasang setelah meeting selesai."
    });
    return false;
  }

  setState({
    ...state,
    status: "restarting",
    message: "Memasang update dan membuka ulang Orviko..."
  });
  setTimeout(() => autoUpdater.quitAndInstall(false, true), 500);
  return true;
}

export function stopDesktopUpdater() {
  if (initialCheckTimer) {
    clearTimeout(initialCheckTimer);
    initialCheckTimer = null;
  }
  if (recurringCheckTimer) {
    clearInterval(recurringCheckTimer);
    recurringCheckTimer = null;
  }
}

async function checkForUpdates() {
  if (!canCheckForDesktopUpdate(state)) {
    return;
  }

  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    setUpdaterError(error, "Pemeriksaan update gagal.");
  }
}

function setUpdaterError(error: unknown, fallback: string) {
  setState({
    ...state,
    status: "error",
    message: readErrorMessage(error, fallback)
  });
}

function setState(nextState: DesktopUpdaterState) {
  state = nextState;
  const mainWindow = options?.getMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("updater:state-changed", state);
  }
}

function readErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}
