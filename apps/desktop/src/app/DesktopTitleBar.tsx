import { useEffect, useState } from "react";
import orvikoLogo from "../assets/orviko-logo.png";

const initialUpdaterState: DesktopUpdaterState = {
  status: "idle",
  currentVersion: ""
};

export function DesktopTitleBar() {
  const [updaterState, setUpdaterState] = useState(initialUpdaterState);

  useEffect(() => {
    let active = true;
    void window.interviewDesktop?.getUpdaterState?.().then((nextState) => {
      if (active) setUpdaterState(nextState);
    });
    const unsubscribe = window.interviewDesktop?.onUpdaterStateChanged?.((nextState) => {
      setUpdaterState(nextState);
    });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  const visible = Boolean(updaterState.availableVersion)
    && updaterState.status !== "idle"
    && updaterState.status !== "checking";
  const interactive = updaterState.status === "available"
    || updaterState.status === "ready"
    || updaterState.status === "waiting-for-meeting"
    || updaterState.status === "error";

  async function handleUpdate() {
    if (!interactive) return;
    const result = await window.interviewDesktop?.downloadUpdate?.();
    if (result && !result.ok) {
      setUpdaterState((current) => ({
        ...current,
        status: "error",
        message: result.message || "Update belum dapat dijalankan."
      }));
    }
  }

  return (
    <header className="desktop-titlebar">
      <div className="desktop-titlebar-brand" aria-label="Orviko">
        <img src={orvikoLogo} alt="" aria-hidden="true" />
        <span>Orviko</span>
      </div>
      {visible ? (
        <button
          type="button"
          className={`desktop-update-button is-${updaterState.status}`}
          onClick={() => void handleUpdate()}
          disabled={!interactive}
          title={updaterState.message || updaterButtonTitle(updaterState)}
        >
          {updaterButtonLabel(updaterState)}
        </button>
      ) : null}
    </header>
  );
}

function updaterButtonLabel(state: DesktopUpdaterState) {
  if (state.status === "downloading") return `${Math.round(state.progressPercent || 0)}%`;
  if (state.status === "waiting-for-meeting") return "Siap";
  if (state.status === "ready") return "Memasang";
  if (state.status === "restarting") return "Restarting";
  if (state.status === "error") return "Coba lagi";
  return "Update";
}

function updaterButtonTitle(state: DesktopUpdaterState) {
  if (state.status === "waiting-for-meeting") return "Update akan dipasang setelah meeting selesai.";
  if (state.status === "downloading") return `Mengunduh Orviko ${state.availableVersion || "terbaru"}.`;
  return `Update Orviko ke ${state.availableVersion || "versi terbaru"}.`;
}
