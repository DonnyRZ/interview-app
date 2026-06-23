import type { LiveMeetingSession, ProfileDocument } from "@interview-app/shared";
import { AudioLevelMeter } from "../audio/AudioLevelMeter.js";
import type { SystemAudioStatus } from "../audio/use-system-audio.js";
import type { WorkspaceMeetingContext } from "./workspace-model.js";

type AudioController = {
  status: SystemAudioStatus;
  message: string;
  level: number;
  trackLabel?: string;
  supported: boolean;
  active: boolean;
  start(): Promise<void>;
  stop(): Promise<void>;
};

type MeetingContextDetailProps = {
  meetingContext: WorkspaceMeetingContext;
  profile: ProfileDocument | null;
  profiles: ProfileDocument[];
  sessions: LiveMeetingSession[];
  sessionError: string;
  workspaceBusy: boolean;
  audio: AudioController;
  overlayActive: boolean;
  overlayError: string;
  realtimeStatus: string;
  realtimeMessage: string;
  latestTranscript: string;
  onStartMeeting(): void;
  onCloseOverlay(): void;
  onSelectProfile(profile: ProfileDocument): void;
  onEndSession(session: LiveMeetingSession): void;
  onDeleteSession(session: LiveMeetingSession): void;
  onBack(): void;
};

const audioStatusLabels: Record<SystemAudioStatus, string> = {
  idle: "Belum terhubung",
  requesting: "Menghubungkan",
  silent: "Terhubung",
  listening: "Audio aktif",
  ended: "Terputus",
  unsupported: "Tidak didukung",
  error: "Perlu diperiksa"
};

export function MeetingContextDetail({
  meetingContext,
  profile,
  profiles,
  sessions,
  sessionError,
  workspaceBusy,
  audio,
  overlayActive,
  overlayError,
  realtimeStatus,
  realtimeMessage,
  latestTranscript,
  onStartMeeting,
  onCloseOverlay,
  onSelectProfile,
  onEndSession,
  onDeleteSession,
  onBack
}: MeetingContextDetailProps) {
  const requesting = audio.status === "requesting";

  return (
    <section className="panel workspace-pane context-detail-pane" aria-labelledby="meeting-detail-title">
      <div className="panel-head workspace-pane-head context-detail-head">
        <div>
          <h2 id="meeting-detail-title">{meetingContext.contextName}</h2>
          <p>{meetingContext.meetingTopic}</p>
        </div>
        <button className="secondary-btn small" type="button" onClick={onBack}>
          Kembali
        </button>
      </div>

      <div className="workspace-pane-scroll">
        <div className="meeting-detail-stack">
          <section className="meeting-detail-card">
            <p className="summary-label">Ringkasan Meeting</p>
            <p>{meetingContext.summary}</p>
          </section>

          <section className="meeting-detail-card">
            <p className="summary-label">Riwayat Sesi Live</p>
            {sessionError ? <p className="overlay-error" role="status">{sessionError}</p> : null}
            {sessions.length ? (
              <div className="round-list">
                {sessions.map((session) => (
                  <div className="round-row" key={session.id}>
                    <div>
                      <strong>Sesi meeting</strong>
                      <span>{session.endedAt ? "Selesai" : "Dimulai"} - {formatDate(session.startedAt)}</span>
                    </div>
                    <button className={`secondary-btn small ${session.endedAt ? "danger-btn" : ""}`} type="button" onClick={() => session.endedAt ? onDeleteSession(session) : onEndSession(session)}>
                      {session.endedAt ? "Hapus" : "Akhiri"}
                    </button>
                  </div>
                ))}
              </div>
            ) : <p className="meeting-detail-muted">Belum ada sesi meeting.</p>}
          </section>

          <section className="meeting-detail-card realtime-readiness-card" aria-labelledby="realtime-readiness-title">
            <div className="audio-readiness-heading">
              <div>
                <p className="summary-label">Transkripsi</p>
                <h3 id="realtime-readiness-title">Realtime Transcript</h3>
              </div>
              <span className={`realtime-status-pill ${realtimeStatus}`}>{formatRealtimeStatus(realtimeStatus)}</span>
            </div>
            <p className="meeting-detail-muted">{realtimeMessage}</p>
            {latestTranscript ? <blockquote className="latest-transcript">{latestTranscript}</blockquote> : null}
          </section>

          <section className="meeting-detail-card">
            <p className="summary-label">Yang Perlu Dipersiapkan</p>
            {meetingContext.preparationThemes.length ? (
              <ul className="preparation-list">
                {meetingContext.preparationThemes.map((theme) => <li key={theme}>{theme}</li>)}
              </ul>
            ) : <p className="meeting-detail-muted">Belum ada tema persiapan dari hasil analisis.</p>}
          </section>

          <section className="meeting-detail-card">
            <p className="summary-label">Profil Referensi</p>
            <strong>{profile?.fileName || "Belum ada profil terhubung"}</strong>
            <p className="meeting-detail-muted">
              {profile ? "Profil siap dipakai sebagai referensi selama meeting." : "Pilih profil sebelum memulai meeting."}
            </p>
            <div className="session-profile-list">
              {profiles.map((candidate) => (
                <div className={`session-profile-row ${candidate.id === meetingContext.profileDocumentId ? "selected" : ""}`} key={candidate.id}>
                  <span>{candidate.fileName}</span>
                  {candidate.id === meetingContext.profileDocumentId
                    ? <span className="pill good">Dipakai</span>
                    : <button className="secondary-btn small" type="button" disabled={workspaceBusy || candidate.processingStatus !== "ready"} onClick={() => onSelectProfile(candidate)}>Pakai</button>}
                </div>
              ))}
            </div>
          </section>

          <details className="meeting-detail-card meeting-brief">
            <summary>Brief Meeting</summary>
            <p>{meetingContext.meetingBriefDisplay}</p>
          </details>

          <section className="meeting-detail-card audio-readiness-card" aria-labelledby="audio-readiness-title">
            <div className="audio-readiness-heading">
              <div>
                <p className="summary-label">Audio Meeting</p>
                <h3 id="audio-readiness-title">System Audio</h3>
              </div>
              <span className={`audio-status-pill ${audio.status}`}>{audioStatusLabels[audio.status]}</span>
            </div>

            <p className="meeting-detail-muted">{audio.message}</p>
            <AudioLevelMeter level={audio.level} status={audio.status} />
            {audio.trackLabel ? <p className="audio-track-label" title={audio.trackLabel}>{audio.trackLabel}</p> : null}

            <div className="audio-readiness-actions">
              <button
                className="secondary-btn open-action-btn"
                type="button"
                onClick={() => void audio.start()}
                disabled={!audio.supported || requesting || audio.active}
              >
                {requesting ? "Menunggu Chrome..." : "Hubungkan System Audio"}
              </button>
              <button
                className="secondary-btn"
                type="button"
                onClick={() => void audio.stop()}
                disabled={!audio.active}
              >
                Hentikan
              </button>
            </div>
          </section>

          <div className="meeting-start-row">
            {overlayError ? <p className="overlay-error" role="status">{overlayError}</p> : null}
            <button
              className={`${overlayActive ? "secondary-btn" : "primary-btn"} start-meeting-btn`}
              type="button"
              disabled={!overlayActive && (!audio.active || !profile)}
              title={!audio.active && !overlayActive ? "Hubungkan system audio sebelum memulai meeting." : undefined}
              onClick={overlayActive ? onCloseOverlay : onStartMeeting}
            >
              {overlayActive ? "Tutup Floating Overlay" : "Mulai Meeting"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatRealtimeStatus(status: string) {
  if (status === "connecting") return "Connecting";
  if (status === "listening") return "Listening";
  if (status === "transcribing") return "Transcribing";
  if (status === "error") return "Error";
  return "Belum dimulai";
}
