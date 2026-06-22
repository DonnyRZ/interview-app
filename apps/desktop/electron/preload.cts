import { contextBridge, ipcRenderer } from "electron";

type RuntimeMediaDevice = {
  deviceId: string;
  kind: string;
  label: string;
};

contextBridge.exposeInMainWorld("interviewDesktop", {
  platform: process.platform,
  listAudioInputDevices: async () => {
    const runtimeNavigator = globalThis.navigator as unknown as {
      mediaDevices?: {
        enumerateDevices: () => Promise<RuntimeMediaDevice[]>;
      };
    };

    if (!runtimeNavigator.mediaDevices?.enumerateDevices) {
      return [];
    }

    const devices = await runtimeNavigator.mediaDevices.enumerateDevices();
    return devices
      .filter((device) => device.kind === "audioinput")
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Audio input ${index + 1}`,
        kind: device.kind,
        isDefault: device.deviceId === "default"
      }));
  },
  checkSystemAudioSupport: () => ipcRenderer.invoke("system-audio:check-support"),
  startSystemAudioProbe: () => ipcRenderer.invoke("system-audio:start-probe"),
  stopSystemAudioProbe: () => ipcRenderer.invoke("system-audio:stop-probe"),
  onSystemAudioProbeEvent: (callback: (payload: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload);
    ipcRenderer.on("system-audio:probe-event", listener);
    return () => ipcRenderer.removeListener("system-audio:probe-event", listener);
  },
  startDesktopLogin: () => ipcRenderer.invoke("desktop-auth:start-login"),
  getDesktopAuthState: () => ipcRenderer.invoke("desktop-auth:get-state"),
  openDesktopCheckout: (plan: "mini" | "starter" | "pro") => ipcRenderer.invoke("desktop-auth:open-checkout", plan),
  apiRequest: (payload: unknown) => ipcRenderer.invoke("desktop-api:request", payload),
  onDesktopAuthChanged: (callback: (payload: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload);
    ipcRenderer.on("desktop-auth:changed", listener);
    return () => ipcRenderer.removeListener("desktop-auth:changed", listener);
  },
  getUpdaterState: () => ipcRenderer.invoke("updater:get-state"),
  downloadUpdate: () => ipcRenderer.invoke("updater:download"),
  onUpdaterStateChanged: (callback: (payload: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload);
    ipcRenderer.on("updater:state-changed", listener);
    return () => ipcRenderer.removeListener("updater:state-changed", listener);
  },
  openOverlay: (context: unknown) => ipcRenderer.invoke("overlay:open", context),
  updateOverlayContext: (context: unknown) => ipcRenderer.invoke("overlay:update-context", context),
  sendRealtimeAction: (payload: unknown) => ipcRenderer.invoke("overlay:send-realtime-action", payload),
  reportRealtimeClientEvent: (payload: unknown) => ipcRenderer.invoke("overlay:realtime-client-event", payload),
  closeOverlay: () => ipcRenderer.invoke("overlay:close"),
  getOverlayContext: () => ipcRenderer.invoke("overlay:get-context"),
  resizeOverlay: (mode: "mini" | "expanded" | "response") => ipcRenderer.invoke("overlay:resize", mode),
  startOverlayDrag: (point: { screenX: number; screenY: number }) => ipcRenderer.invoke("overlay:start-drag", point),
  stopOverlayDrag: () => ipcRenderer.invoke("overlay:stop-drag"),
  endOverlayInterview: (payload: unknown) => ipcRenderer.invoke("overlay:end-interview", payload),
  onOverlayContextUpdated: (callback: (payload: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload);
    ipcRenderer.on("overlay:context-updated", listener);
    return () => ipcRenderer.removeListener("overlay:context-updated", listener);
  },
  onRealtimeOverlayEvent: (callback: (payload: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload);
    ipcRenderer.on("overlay:realtime-event", listener);
    return () => ipcRenderer.removeListener("overlay:realtime-event", listener);
  },
  onOverlayInterviewEnded: (callback: (payload: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload);
    ipcRenderer.on("overlay:interview-ended", listener);
    return () => ipcRenderer.removeListener("overlay:interview-ended", listener);
  }
});
