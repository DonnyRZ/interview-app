import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { SystemAudioStatus } from "../audio/use-system-audio.js";
import type {
  MeetingHelpAction,
  MeetingHelpController
} from "../realtime/use-realtime-transcription.js";
import type { FloatingOverlayMode } from "./use-floating-overlay.js";

type FloatingAudioOverlayProps = {
  status: SystemAudioStatus;
  trackLabel?: string;
  realtimeStatus: string;
  realtimeMessage: string;
  transcript: string;
  contextName: string;
  meetingTopic: string;
  help: MeetingHelpController;
  onModeChange(mode: FloatingOverlayMode): void;
  onClose(): void;
};

const actionButtons: Array<{ action: MeetingHelpAction; label: string }> = [
  { action: "answer_qna", label: "Jawab Pertanyaan" },
  { action: "answer_convo", label: "Tanggapi" },
  { action: "followup", label: "Pertanyaan Follow-up" },
  { action: "explain", label: "Jelaskan Maksudnya" }
];

export function FloatingAudioOverlay({
  status,
  trackLabel,
  realtimeStatus,
  realtimeMessage,
  transcript,
  contextName,
  meetingTopic,
  help,
  onModeChange,
  onClose
}: FloatingAudioOverlayProps) {
  const [expanded, setExpanded] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [askText, setAskText] = useState("");
  const displayMode = !expanded ? "mini" : help.mode;
  const hasResponseShell = displayMode === "loading" || displayMode === "response";

  useEffect(() => {
    const timer = window.setInterval(() => setElapsedSeconds((current) => current + 1), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    onModeChange(displayMode === "mini" ? "mini" : hasResponseShell ? "response" : "expanded");
  }, [displayMode, hasResponseShell, onModeChange]);

  function toggleExpanded() {
    if (!expanded) {
      setExpanded(true);
      return;
    }
    help.closeResponse();
    setExpanded(false);
  }

  function submitAsk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = askText.trim();
    if (!value) return;
    help.requestHelp("explain_text", value);
    setAskText("");
  }

  if (displayMode === "mini") {
    return (
      <main className="overlay-root mini">
        <section className="overlay-bar">
          <span className="overlay-chip"><span className="pulse" /> Listening {formatTime(elapsedSeconds)}</span>
          <span className={`overlay-chip audio ${isAudioReady(status) ? "ready" : "warn"}`}>
            {isAudioReady(status) ? "System OK" : "Audio setup"}
          </span>
          <button className="overlay-button" type="button" onClick={toggleExpanded}>Ask *</button>
          <button className="overlay-end" type="button" onClick={onClose} aria-label="End meeting" />
        </section>
      </main>
    );
  }

  return (
    <main className={`overlay-root panel ${hasResponseShell ? "with-response" : ""}`}>
      <section className={`overlay-panel ${hasResponseShell ? "compact-when-response" : ""}`}>
        <div className="overlay-top">
          <div>
            <p className="overlay-kicker">Listening {formatTime(elapsedSeconds)}</p>
            <h1>Live Meeting</h1>
            <p>{contextName} - {meetingTopic}</p>
            <p className="overlay-audio-status" title={trackLabel}>{getAudioStatusText(status, realtimeStatus, realtimeMessage)}</p>
          </div>
          <button className="overlay-button" type="button" onClick={toggleExpanded}>Hide</button>
        </div>

        <div className="overlay-card question-card" aria-live="polite">
          <strong>Latest conversation focus</strong>
          <p>{transcript || "Belum ada konteks percakapan tertangkap."}</p>
        </div>

        <div className="overlay-actions">
          {actionButtons.map(({ action, label }) => (
            <button key={action} type="button" onClick={() => help.requestHelp(action)}>
              {label}
            </button>
          ))}
        </div>

        {help.keywords.length ? (
          <div className="overlay-keywords">
            {help.keywords.map((keyword) => (
              <button key={keyword} type="button" onClick={() => help.requestHelp("keyword", keyword)}>{keyword}</button>
            ))}
          </div>
        ) : (
          <div className="overlay-card keyword-empty-card">
            <strong>Runtime keyword chips</strong>
            <p>Keyword akan muncul dari transkrip terbaru.</p>
          </div>
        )}

        <form className="overlay-ask" onSubmit={submitAsk}>
          <input
            value={askText}
            onChange={(event) => setAskText(event.target.value)}
            placeholder="Tulis bantuan spesifik..."
            aria-label="Tulis bantuan spesifik"
          />
          <button type="submit" disabled={!askText.trim()}>Ask</button>
        </form>

        {help.recentHelp.length ? (
          <div className="overlay-card history">
            <strong>Recent Help</strong>
            {help.recentHelp.map((item, index) => (
              <p key={`${item.title}-${index}`}>{item.title} - {item.points[0]}</p>
            ))}
          </div>
        ) : null}
      </section>

      {displayMode === "loading" ? (
        <aside className="response-shell" aria-live="polite">
          <h2>Menyiapkan bantuan...</h2>
          <div className="overlay-loading"><span /><span /><span /></div>
        </aside>
      ) : null}

      {displayMode === "response" && help.activeResponse ? (
        <aside className="response-shell" aria-live="polite">
          <div className="response-top">
            <div>
              <p className="overlay-kicker">Meeting help</p>
              <h2>{help.activeResponse.title}</h2>
            </div>
            <button className="overlay-button" type="button" onClick={help.closeResponse}>Close</button>
          </div>
          <ul>
            {help.activeResponse.points.map((point) => <li key={point}>{point}</li>)}
          </ul>
        </aside>
      ) : null}
    </main>
  );
}

function isAudioReady(status: SystemAudioStatus) {
  return status === "silent" || status === "listening";
}

function getAudioStatusText(status: SystemAudioStatus, realtimeStatus: string, realtimeMessage: string) {
  if (realtimeStatus === "connecting") return "Realtime connecting";
  if (realtimeStatus === "listening" || realtimeStatus === "transcribing") return realtimeMessage || "Realtime listening";
  if (realtimeStatus === "error") return realtimeMessage || "Realtime error";
  if (isAudioReady(status)) return "System audio OK";
  return "Audio needs validation";
}

function formatTime(totalSeconds: number) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}
