import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import type { MeetingContext, ProfileDocument, LiveMeetingSession, MeetingSessionType } from "@interview-app/shared";
import orvikoLogo from "../../assets/orviko-logo.png";
import { createMeetingContext, deleteMeetingContext as deleteMeetingContextRequest, getMeetingContexts, updateMeetingContext as updateMeetingContextRequest } from "../meeting-contexts/meeting-context-api.js";
import { deleteLiveMeetingSession, endLiveMeeting, getLiveMeetingSessions, startLiveMeeting } from "../live-meetings/live-meeting-api.js";
import { deleteProfileDocument, getActiveProfileDocument, getProfileDocumentList, retryProfileDocumentProcessing, uploadProfileDocument } from "./profile-document-api.js";

type LoadState = "idle" | "loading" | "uploading" | "processingMeetingContext" | "error";
type WorkspaceView = "dashboard" | "createMeetingContext" | "meetingContextDetail" | "liveMeeting";
type SystemAudioProbeStatus = "unsupported" | "missing" | "idle" | "checking" | "ok" | "silent" | "error" | "stopped";

type OverlayEndPayload = {
  liveMeetingSessionId?: string;
  meetingContextId?: string;
  transcriptText?: string;
};

const DEFAULT_MEETING_STAGE: MeetingSessionType = "OTHER";

export function ProfileDocumentDashboard() {
  const [activeProfileDocument, setActiveProfileDocumentState] = useState<ProfileDocument | null>(null);
  const [profileDocuments, setProfileDocuments] = useState<ProfileDocument[]>([]);
  const [meetingContexts, setMeetingContexts] = useState<MeetingContext[]>([]);
  const [selectedMeetingContext, setSelectedMeetingContext] = useState<MeetingContext | null>(null);
  const [liveMeetingSessions, setLiveMeetingSessions] = useState<LiveMeetingSession[]>([]);
  const [activeLiveMeetingSession, setActiveLiveMeetingSession] = useState<LiveMeetingSession | null>(null);
  const [status, setStatus] = useState<LoadState>("idle");
  const [message, setMessage] = useState("Hubungkan backend API, lalu upload profil pertama untuk mulai membuat referensi user.");
  const [view, setView] = useState<WorkspaceView>("dashboard");
  const [systemAudioSupport, setSystemAudioSupport] = useState<SystemAudioSupport | null>(null);
  const [systemAudioStatus, setSystemAudioStatus] = useState<SystemAudioProbeStatus>("unsupported");
  const [systemAudioLevel, setSystemAudioLevel] = useState(0);
  const [systemAudioMessage, setSystemAudioMessage] = useState("Audio meeting belum dicek.");
  async function refreshProfileDocuments(options: { silent?: boolean } = {}) {
    if (!options.silent) {
      setStatus("loading");
    }
    try {
      const [activeResponse, listResponse] = await Promise.all([
        getActiveProfileDocument(),
        getProfileDocumentList()
      ]);
      setActiveProfileDocumentState(activeResponse.profileDocument);
      setProfileDocuments(listResponse.profileDocuments);
      if (!options.silent) {
        setStatus("idle");
      }
      setMessage(getProfileDocumentStatusMessage(activeResponse.profileDocument));
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Gagal memuat profil.");
    }
  }

  useEffect(() => {
    void refreshWorkspace();
    void refreshSystemAudioSupport();
    const unsubscribeSystemProbe = window.interviewDesktop?.onSystemAudioProbeEvent?.(handleSystemAudioProbeEvent);

    return () => {
      void window.interviewDesktop?.stopSystemAudioProbe?.();
      unsubscribeSystemProbe?.();
    };
  }, []);

  useEffect(() => {
    return window.interviewDesktop?.onOverlayInterviewEnded?.((payload) => {
      void handleOverlayLiveMeetingEnded(payload as OverlayEndPayload);
    });
  }, [selectedMeetingContext?.id]);

  useEffect(() => {
    if (activeProfileDocument?.processingStatus !== "processing") return;

    const pollId = window.setInterval(() => {
      void refreshProfileDocuments({ silent: true });
    }, 1600);

    return () => window.clearInterval(pollId);
  }, [activeProfileDocument?.id, activeProfileDocument?.processingStatus]);

  async function refreshWorkspace() {
    await Promise.all([
      refreshProfileDocuments(),
      refreshMeetingContexts()
    ]);
  }

  async function refreshSystemAudioSupport() {
    if (!window.interviewDesktop?.checkSystemAudioSupport) {
      setSystemAudioSupport(null);
      setSystemAudioStatus("unsupported");
      setSystemAudioMessage("System audio loopback hanya tersedia di Electron desktop.");
      return;
    }

    try {
      const support = await window.interviewDesktop.checkSystemAudioSupport();
      setSystemAudioSupport(support);
      setSystemAudioStatus(!support.supported ? "unsupported" : support.helperExists ? "idle" : "missing");
      setSystemAudioMessage(support.message);
      setSystemAudioLevel(0);
    } catch (error) {
      setSystemAudioSupport(null);
      setSystemAudioStatus("error");
      setSystemAudioLevel(0);
      setSystemAudioMessage(error instanceof Error ? error.message : "Audio meeting belum bisa dicek.");
    }
  }

  async function startSystemAudioProbe() {
    if (!window.interviewDesktop?.startSystemAudioProbe) {
      setSystemAudioStatus("unsupported");
      setSystemAudioMessage("Pengecekan audio hanya tersedia di aplikasi desktop.");
      return;
    }

    setSystemAudioStatus("checking");
    setSystemAudioLevel(0);
    setSystemAudioMessage("Sedang mengecek audio meeting...");

    try {
      const response = await window.interviewDesktop.startSystemAudioProbe();
      if (!response.ok) {
        setSystemAudioStatus("error");
        setSystemAudioLevel(0);
        setSystemAudioMessage(response.message || "Audio meeting belum bisa dicek.");
      }
    } catch (error) {
      setSystemAudioStatus("error");
      setSystemAudioLevel(0);
      setSystemAudioMessage(error instanceof Error ? error.message : "Audio meeting belum bisa dicek.");
    }
  }

  async function stopSystemAudioProbe() {
    await window.interviewDesktop?.stopSystemAudioProbe?.();
  }

  function handleSystemAudioProbeEvent(event: SystemAudioProbeEvent) {
    const nextLevel = Number.isFinite(event.level) ? Math.max(0, Math.min(1, event.level)) : 0;
    const deviceSuffix = event.deviceLabel ? ` (${event.deviceLabel})` : "";
    setSystemAudioLevel(nextLevel);
    setSystemAudioMessage(`${event.message || "Status audio meeting diperbarui."}${deviceSuffix}`);

    if (event.status === "started" || event.status === "checking") {
      setSystemAudioStatus("checking");
      return;
    }
    if (event.status === "ok") {
      setSystemAudioStatus("ok");
      return;
    }
    if (event.status === "silent") {
      setSystemAudioStatus("silent");
      return;
    }
    if (event.status === "stopped") {
      setSystemAudioStatus("stopped");
      return;
    }
    if (event.status === "error") {
      setSystemAudioStatus("error");
    }
  }

  async function refreshMeetingContexts() {
    try {
      const response = await getMeetingContexts();
      setMeetingContexts(response.meetingContexts);
      setSelectedMeetingContext((current) => current ? response.meetingContexts.find((item) => item.id === current.id) || null : null);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Gagal memuat konteks meeting.");
    }
  }

  async function refreshLiveMeetingSessions(meetingContextId: string) {
    try {
      const response = await getLiveMeetingSessions(meetingContextId);
      setLiveMeetingSessions(response.liveMeetingSessions);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Gagal memuat sesi meeting.");
    }
  }

  function selectMeetingContext(meetingContext: MeetingContext) {
    setSelectedMeetingContext(meetingContext);
    setActiveLiveMeetingSession(null);
    setView("meetingContextDetail");
    void refreshLiveMeetingSessions(meetingContext.id);
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    setStatus("uploading");
    setMessage(`Mengupload ${file.name}...`);

    try {
      const response = await uploadProfileDocument(file);
      setActiveProfileDocumentState(response.profileDocument);
      await refreshProfileDocuments();
      setMessage(`${response.profileDocument.fileName} berhasil diupload. AI sedang memproses profil sebelum bisa dipakai membuat konteks meeting.`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Upload profil gagal.");
    }
  }

  async function handleRetryProfileDocumentProcessing(profileDocumentId: string) {
    setStatus("loading");
    try {
      const response = await retryProfileDocumentProcessing(profileDocumentId);
      setActiveProfileDocumentState(response.profileDocument);
      await refreshProfileDocuments();
      setStatus("idle");
      setMessage(`${response.profileDocument.fileName} sedang diproses ulang oleh AI.`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Gagal retry AI processing profil.");
    }
  }

  async function handleDeleteProfileDocument(profileDocument: ProfileDocument) {
    const activeNote = profileDocument.isActive ? " Profil terbaru lain akan otomatis menjadi profil default jika tersedia." : "";
    const confirmed = window.confirm(`Hapus profil "${profileDocument.fileName}"? File upload dan hasil AI processing profil ini akan dihapus.${activeNote}`);
    if (!confirmed) {
      return;
    }

    setStatus("loading");
    try {
      await deleteProfileDocument(profileDocument.id);
      await refreshProfileDocuments();
      setStatus("idle");
      setMessage(`${profileDocument.fileName} berhasil dihapus.`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Gagal menghapus profil.");
    }
  }

  async function handleCreateMeetingContext(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const contextName = String(formData.get("contextName") || "").trim();
    const meetingTopic = String(formData.get("meetingTopic") || "").trim();
    const meetingBrief = String(formData.get("meetingBrief") || "").trim();

    if (!contextName || !meetingTopic) {
      setStatus("error");
      setMessage("Nama konteks dan topik meeting wajib diisi.");
      return;
    }

    if (!isProfileDocumentReady(activeProfileDocument)) {
      setStatus("error");
      setMessage("Tunggu profil default selesai diproses AI sebelum membuat konteks meeting.");
      return;
    }

    setStatus("processingMeetingContext");
    try {
      const response = await createMeetingContext({
        contextName,
        meetingTopic,
        meetingBrief
      });
      form.reset();
      await refreshMeetingContexts();
      setSelectedMeetingContext(response.meetingContext);
      await refreshLiveMeetingSessions(response.meetingContext.id);
      setView("meetingContextDetail");
      setStatus("idle");
      setMessage(`${response.meetingContext.contextName} - ${response.meetingContext.meetingTopic} berhasil dibuat.`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Gagal membuat konteks meeting.");
    }
  }

  async function handleDeleteMeetingContext(meetingContext: MeetingContext) {
    const companyRole = `${meetingContext.contextName} - ${meetingContext.meetingTopic}`;
    const confirmed = window.confirm(`Hapus konteks meeting "${companyRole}" beserta semua sesi live di dalamnya?`);
    if (!confirmed) {
      return;
    }

    setStatus("loading");
    try {
      await deleteMeetingContextRequest(meetingContext.id);
      await refreshMeetingContexts();

      if (selectedMeetingContext?.id === meetingContext.id) {
        setSelectedMeetingContext(null);
        setLiveMeetingSessions([]);
        setActiveLiveMeetingSession(null);
        setView("dashboard");
      }

      setStatus("idle");
      setMessage(`${companyRole} berhasil dihapus.`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Gagal menghapus konteks meeting.");
    }
  }

  async function handleSelectProfileDocumentForMeetingContext(meetingContext: MeetingContext, profileDocument: ProfileDocument) {
    if (!isProfileDocumentReady(profileDocument)) {
      setStatus("error");
      setMessage("Profil ini belum ready. Tunggu AI processing selesai sebelum dipakai untuk konteks meeting.");
      return;
    }

    if (meetingContext.profileDocumentId === profileDocument.id) {
      setMessage("Konteks meeting ini sudah memakai profil referensi tersebut.");
      return;
    }

    setStatus("processingMeetingContext");
    try {
      const response = await updateMeetingContextRequest(meetingContext.id, {
        profileDocumentId: profileDocument.id
      });
      setSelectedMeetingContext(response.meetingContext);
      await refreshMeetingContexts();
      await refreshLiveMeetingSessions(response.meetingContext.id);
      setStatus("idle");
      setMessage(`Konteks meeting sekarang memakai profil referensi: ${profileDocument.fileName}.`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Gagal mengganti profil untuk konteks meeting.");
    }
  }

  async function handleDeleteLiveMeetingSession(round: LiveMeetingSession) {
    if (!round.endedAt) {
      setStatus("error");
      setMessage("Sesi meeting yang masih berjalan harus diakhiri dulu sebelum dihapus.");
      return;
    }

    const confirmed = window.confirm(`Hapus sesi ${round.sessionType} dari ${formatDate(round.startedAt)}? Transkrip sesi ini ikut terhapus.`);
    if (!confirmed) {
      return;
    }

    setStatus("loading");
    try {
      await deleteLiveMeetingSession(round.id);
      if (activeLiveMeetingSession?.id === round.id) {
        setActiveLiveMeetingSession(null);
      }
      await refreshLiveMeetingSessions(round.meetingContextId);
      setStatus("idle");
      setMessage(`Sesi ${round.sessionType} berhasil dihapus.`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Gagal menghapus sesi meeting.");
    }
  }

  async function handleEndLiveMeetingSession(round: LiveMeetingSession) {
    if (round.endedAt) {
      setMessage("Sesi meeting ini sudah selesai.");
      return;
    }

    const confirmed = window.confirm(`Akhiri sesi meeting dari ${formatDate(round.startedAt)}? Setelah selesai, sesi ini bisa dihapus.`);
    if (!confirmed) {
      return;
    }

    setStatus("loading");
    try {
      const response = await endLiveMeeting(round.id, {
        transcriptText: "Sesi meeting diakhiri dari dashboard karena tidak ada live overlay aktif."
      });
      setActiveLiveMeetingSession(response.liveMeetingSession);
      await refreshLiveMeetingSessions(round.meetingContextId);
      setStatus("idle");
      setMessage("Sesi meeting berhasil diakhiri. Sekarang sesi ini bisa dihapus.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Gagal mengakhiri sesi meeting.");
    }
  }

  async function handleStartInterview(meetingContext: MeetingContext) {
    setStatus("loading");
    try {
      const response = await startLiveMeeting({
        meetingContextId: meetingContext.id,
        sessionType: DEFAULT_MEETING_STAGE
      });
      setActiveLiveMeetingSession(response.liveMeetingSession);

      if (window.interviewDesktop?.openOverlay) {
        try {
          const hasSystemAudio = systemAudioStatus === "ok";
          await window.interviewDesktop.openOverlay({
            liveMeetingSessionId: response.liveMeetingSession.id,
            meetingContextId: meetingContext.id,
            contextName: meetingContext.contextName,
            meetingTopic: meetingContext.meetingTopic,
            sessionType: DEFAULT_MEETING_STAGE,
            audioStatus: hasSystemAudio ? "ready" : "waiting",
            audioDeviceLabel: hasSystemAudio ? "Active system output (WASAPI loopback)" : "System audio loopback",
            audioSourceKind: "system-loopback",
            domainLabel: response.realtimeContext?.domainProfile.primaryDomain || getDomainProfile(meetingContext).primaryDomain,
            realtimeContext: response.realtimeContext
          });
        } catch (overlayError) {
          await endLiveMeeting(response.liveMeetingSession.id, {
            transcriptText: "Sesi meeting otomatis ditutup karena floating overlay gagal dibuka."
          });
          await refreshLiveMeetingSessions(meetingContext.id);
          setStatus("error");
          setMessage(overlayError instanceof Error ? overlayError.message : "Floating overlay gagal dibuka. Sesi meeting sudah ditutup otomatis.");
          return;
        }
        await refreshLiveMeetingSessions(meetingContext.id);
        setStatus("idle");
        setMessage("Sesi meeting dimulai. Floating overlay aktif.");
      } else if (window.interviewDesktop) {
        await endLiveMeeting(response.liveMeetingSession.id, {
          transcriptText: "Sesi meeting otomatis ditutup karena Electron overlay bridge belum tersedia."
        });
        await refreshLiveMeetingSessions(meetingContext.id);
        setStatus("error");
        setMessage("Electron overlay bridge belum tersedia. Restart dev:desktop supaya preload/main Electron terbaru aktif.");
      } else {
        await refreshLiveMeetingSessions(meetingContext.id);
        setView("liveMeeting");
        setStatus("idle");
        setMessage("Sesi meeting dimulai. Browser fallback aktif.");
      }
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Gagal memulai sesi meeting.");
    }
  }

  async function handleOverlayLiveMeetingEnded(payload: OverlayEndPayload) {
    if (!payload.liveMeetingSessionId) {
      setMessage("Overlay ditutup, tapi ID sesi meeting tidak ditemukan.");
      return;
    }

    setStatus("loading");
    try {
      const response = await endLiveMeeting(payload.liveMeetingSessionId, {
        transcriptText: payload.transcriptText
      });
      setActiveLiveMeetingSession(response.liveMeetingSession);
      const meetingContextIdToRefresh = payload.meetingContextId || response.liveMeetingSession.meetingContextId;
      if (selectedMeetingContext?.id === meetingContextIdToRefresh) {
        await refreshLiveMeetingSessions(meetingContextIdToRefresh);
      } else {
        await refreshMeetingContexts();
      }
      setStatus("idle");
      setMessage("Sesi meeting berakhir. Transkrip terbaru sudah tersimpan di sesi.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Gagal mengakhiri sesi meeting.");
    }
  }

  useEffect(() => {
    if (selectedMeetingContext) {
      void refreshLiveMeetingSessions(selectedMeetingContext.id);
    } else {
      setLiveMeetingSessions([]);
    }
  }, [selectedMeetingContext?.id]);

  if (view === "liveMeeting" && selectedMeetingContext && activeLiveMeetingSession) {
    return (
      <InterviewSessionPlaceholder
        meetingContext={selectedMeetingContext}
        liveMeetingSession={activeLiveMeetingSession}
        onBack={() => setView("meetingContextDetail")}
      />
    );
  }

  if (view === "createMeetingContext") {
    return (
      <Shell activeProfileDocument={activeProfileDocument}>
        <CreateMeetingContextView
          activeProfileDocument={activeProfileDocument}
          onCancel={() => setView("dashboard")}
          onSubmit={(event) => void handleCreateMeetingContext(event)}
          isLoading={status === "processingMeetingContext"}
        />
      </Shell>
    );
  }

  if (view === "meetingContextDetail" && selectedMeetingContext) {
    return (
      <Shell activeProfileDocument={activeProfileDocument}>
        <MeetingContextDetailView
          meetingContext={selectedMeetingContext}
          profileDocuments={profileDocuments}
          linkedProfileDocument={profileDocuments.find((profileDocument) => profileDocument.id === selectedMeetingContext.profileDocumentId) || null}
          liveMeetingSessions={liveMeetingSessions}
          onBack={() => setView("dashboard")}
          onDelete={() => void handleDeleteMeetingContext(selectedMeetingContext)}
          onDeleteRound={(round) => void handleDeleteLiveMeetingSession(round)}
          onEndRound={(round) => void handleEndLiveMeetingSession(round)}
          onSelectProfileDocument={(profileDocument) => void handleSelectProfileDocumentForMeetingContext(selectedMeetingContext, profileDocument)}
          onStartInterview={() => void handleStartInterview(selectedMeetingContext)}
          systemAudioSupport={systemAudioSupport}
          systemAudioStatus={systemAudioStatus}
          systemAudioLevel={systemAudioLevel}
          systemAudioMessage={systemAudioMessage}
          onStartSystemAudioProbe={() => void startSystemAudioProbe()}
          onStopSystemAudioProbe={() => void stopSystemAudioProbe()}
          onRefreshSystemAudioSupport={() => void refreshSystemAudioSupport()}
          isLoading={status === "loading" || status === "processingMeetingContext"}
        />
      </Shell>
    );
  }

  return (
    <Shell activeProfileDocument={activeProfileDocument}>
      <section className="section-head">
        <div>
          <h1>Meeting Workspace</h1>
        </div>
        <button
          className="primary-btn icon-btn new-session-btn"
          onClick={() => setView("createMeetingContext")}
          disabled={!isProfileDocumentReady(activeProfileDocument)}
          aria-label="Buat konteks meeting baru"
          title="Buat konteks meeting baru"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </section>

      <section className="dashboard-stack">
        <section className="panel dashboard-panel">
          <div className="panel-head dashboard-panel-head">
            <h2>Konteks Meeting</h2>
          </div>

          {meetingContexts.length ? (
            <div className="dashboard-table">
              {meetingContexts.map((meetingContext) => {
                return (
                  <article className="dashboard-app-row" key={meetingContext.id}>
                    <div className="dashboard-app-title">
                      <div className="dashboard-app-title-line">
                        <strong>{meetingContext.contextName} - {meetingContext.meetingTopic}</strong>
                      </div>
                      <span>Fokus: {getDashboardMeetingContextFocus(meetingContext)}</span>
                    </div>

                    <div className="dashboard-row-actions">
                      <button
                        className="secondary-btn dashboard-action-btn open-action-btn"
                        onClick={() => selectMeetingContext(meetingContext)}
                      >
                        Buka
                      </button>
                      <button
                        className="secondary-btn small danger-btn"
                        onClick={() => void handleDeleteMeetingContext(meetingContext)}
                        disabled={status === "loading" || status === "processingMeetingContext" || status === "uploading"}
                      >
                        Hapus
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="dashboard-empty-meetingContexts">
              <div className="eyebrow">Meeting workspace</div>
              <h2>Belum ada konteks meeting</h2>
              <p className="subcopy">Upload profil dulu, lalu buat konteks pertama dengan nama meeting, topik, dan brief yang relevan.</p>
            </div>
          )}
        </section>

        <ProfileContextPanel
          activeProfileDocument={activeProfileDocument}
          profileDocuments={profileDocuments}
          status={status}
          message={message}
          onUpload={handleUpload}
          onRetryProcessing={(profileDocumentId) => void handleRetryProfileDocumentProcessing(profileDocumentId)}
          onDeleteProfileDocument={(profileDocument) => void handleDeleteProfileDocument(profileDocument)}
        />
      </section>
    </Shell>
  );
}

function Shell({ activeProfileDocument, children }: { activeProfileDocument: ProfileDocument | null; children: ReactNode }) {
  return (
    <main className="workspace">
      <nav className="topbar">
        <div className="brand">
          <img className="brand-logo" src={orvikoLogo} alt="" aria-hidden="true" />
          <strong>Orviko</strong>
        </div>
        <div className="profile-pill">
          <span>Profil default: {activeProfileDocument?.fileName || "Belum ada"}</span>
          <span className="avatar" aria-hidden="true" />
        </div>
      </nav>
      {children}
    </main>
  );
}

function CreateMeetingContextView({
  activeProfileDocument,
  onCancel,
  onSubmit,
  isLoading
}: {
  activeProfileDocument: ProfileDocument | null;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isLoading: boolean;
}) {
  const profileDocumentReady = isProfileDocumentReady(activeProfileDocument);

  return (
    <>
      <section className="section-head">
        <div>
          <h1>Buat Konteks Meeting</h1>
          <p className="subcopy">Konteks meeting menyimpan brief, topik, profil default, dan batas relevansi untuk semua sesi live berikutnya.</p>
        </div>
        <button className="secondary-btn" onClick={onCancel}>Kembali</button>
      </section>

      <section className="grid two">
        <form className="panel field-stack" onSubmit={onSubmit}>
          {!profileDocumentReady ? (
            <AiStatusCard
              title="Profil belum siap"
              status={activeProfileDocument?.processingStatus || "failed"}
              message="Tunggu AI processing profil selesai sebelum membuat konteks meeting baru."
            />
          ) : null}
              <label className="field">
                <span>Nama konteks</span>
            <input name="contextName" placeholder="Weekly Product Sync" defaultValue="" />
              </label>
              <label className="field">
                <span>Topik meeting</span>
            <input name="meetingTopic" placeholder="Roadmap planning" defaultValue="" />
              </label>
              <label className="field">
                <span>Brief / konteks meeting</span>
            <textarea name="meetingBrief" placeholder="Paste agenda, notes, dokumen, atau konteks penting di sini..." />
              </label>
              <div className="summary-item">
                <p className="summary-label">Profil Default</p>
                <strong>{activeProfileDocument?.fileName || "Belum ada profil default"}</strong>
                <p className="subcopy compact">Konteks meeting baru akan memakai profil default saat ini.</p>
              </div>
          {activeProfileDocument ? <ProfileDocumentProcessingStatus profileDocument={activeProfileDocument} compact /> : null}
          <button className="primary-btn" type="submit" disabled={!profileDocumentReady || isLoading}>
                {isLoading ? "Menganalisis konteks..." : "Simpan Konteks Meeting"}
              </button>
            </form>

        <aside className="panel">
          <h2>AI Processing</h2>
          <p className="subcopy">Saat disimpan, backend akan membuat ringkasan meeting, batas relevansi, dan konteks persiapan dari profil default + brief meeting.</p>
          {isLoading ? (
            <AiStatusCard
              title="Menganalisis konteks domain"
              status="processing"
              message="AI sedang membuat meeting summary, relevance boundary, dan preparation themes."
            />
          ) : null}
          <div className="keywords">
            <span className="pill">Meeting summary</span>
            <span className="pill">Relevance boundary</span>
            <span className="pill">Prep themes</span>
          </div>
        </aside>
      </section>
    </>
  );
}

function ProfileContextPanel({
  activeProfileDocument,
  profileDocuments,
  status,
  message,
  onUpload,
  onRetryProcessing,
  onDeleteProfileDocument
}: {
  activeProfileDocument: ProfileDocument | null;
  profileDocuments: ProfileDocument[];
  status: LoadState;
  message: string;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onRetryProcessing: (profileDocumentId: string) => void;
  onDeleteProfileDocument: (profileDocument: ProfileDocument) => void;
}) {
  const historyItems = profileDocuments.length ? profileDocuments : activeProfileDocument ? [activeProfileDocument] : [];

  return (
    <section className="panel dashboard-panel profile-panel-home">
      <div className="panel-head dashboard-panel-head">
        <div>
          <h2>Profil & Referensi User</h2>
        </div>
      </div>

      <div className="dashboard-profile-grid">
        <article className="dashboard-profile-card">
          <b className="summary-label">Profil Default</b>
          {activeProfileDocument ? (
            <>
              <strong>{activeProfileDocument.fileName}</strong>
              <p>Diupload {formatDate(activeProfileDocument.createdAt)}. Profil ini menjadi default untuk konteks meeting baru.</p>
            </>
          ) : (
            <>
              <strong>Belum ada profil default</strong>
              <p>Upload profil pertama untuk mulai membuat referensi user dan membuka workflow konteks meeting.</p>
            </>
          )}

          <div className="dashboard-card-actions">
            <label className="primary-btn dashboard-upload-btn upload-btn">
              Upload Profil Baru
              <input type="file" accept=".pdf,.doc,.docx" onChange={onUpload} disabled={status === "uploading"} />
            </label>
          </div>
        </article>

        <article className={`dashboard-profile-card dashboard-status-card ${activeProfileDocument?.processingStatus || "uploaded"}`}>
          <b className="summary-label">{activeProfileDocument ? getProfileDocumentProcessingTitle(activeProfileDocument) : "AI Processing"}</b>
          <strong>{activeProfileDocument ? getProfileDocumentProcessingTitle(activeProfileDocument) : "Belum ada profil default"}</strong>
          <p>{activeProfileDocument ? getProfileDocumentProcessingDetail(activeProfileDocument) : "AI processing akan berjalan setelah profil pertama diupload."}</p>
          {activeProfileDocument?.processingStatus === "failed" ? (
            <div className="dashboard-card-actions">
              <button className="secondary-btn small" type="button" onClick={() => onRetryProcessing(activeProfileDocument.id)}>
                Coba Lagi
              </button>
            </div>
          ) : null}
        </article>

        <article className="dashboard-profile-card">
          <b className="summary-label">Ringkasan Profil</b>
          <strong>{activeProfileDocument?.fileName || "Profile summary"}</strong>
          <p>{activeProfileDocument ? getCandidateSummary(activeProfileDocument) : "Upload profil untuk membuat ringkasan user yang dipakai ulang di semua konteks meeting."}</p>
        </article>
      </div>

      {historyItems.length ? (
        <div className="dashboard-history-panel">
          <h3>Riwayat Versi Profil</h3>
          <div className="dashboard-profileDocument-history">
            {historyItems.map((profileDocument) => (
              <div className="dashboard-profileDocument-row" key={profileDocument.id}>
                <div>
                  <strong>{profileDocument.fileName}</strong>
                  <p>{profileDocument.isActive ? "Aktif" : "Diproses"} - {profileDocument.processingStatus} - diupload {formatDate(profileDocument.createdAt)}</p>
                </div>

                <div className="dashboard-profileDocument-actions">
                  <span className={`pill ${profileDocument.processingStatus === "ready" ? "good" : profileDocument.processingStatus === "failed" ? "danger" : "warn"}`}>
                    {profileDocument.isActive ? "default" : profileDocument.processingStatus}
                  </span>
                  <button
                    className="secondary-btn small danger-btn"
                    onClick={() => onDeleteProfileDocument(profileDocument)}
                    disabled={status === "loading" || status === "uploading"}
                  >
                    Hapus
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className={`status-card slim ${status === "error" ? "error" : ""}`}>
        <strong>{status === "uploading" ? "Mengupload Profil" : status === "loading" ? "Menyinkronkan" : "Status"}</strong>
        <p>{message}</p>
      </div>
    </section>
  );
}

function MeetingContextDetailView({
  meetingContext,
  profileDocuments,
  linkedProfileDocument,
  liveMeetingSessions,
  onBack,
  onDelete,
  onDeleteRound,
  onEndRound,
  onSelectProfileDocument,
  onStartInterview,
  systemAudioSupport,
  systemAudioStatus,
  systemAudioLevel,
  systemAudioMessage,
  onStartSystemAudioProbe,
  onStopSystemAudioProbe,
  onRefreshSystemAudioSupport,
  isLoading
}: {
  meetingContext: MeetingContext;
  profileDocuments: ProfileDocument[];
  linkedProfileDocument: ProfileDocument | null;
  liveMeetingSessions: LiveMeetingSession[];
  onBack: () => void;
  onDelete: () => void;
  onDeleteRound: (round: LiveMeetingSession) => void;
  onEndRound: (round: LiveMeetingSession) => void;
  onSelectProfileDocument: (profileDocument: ProfileDocument) => void;
  onStartInterview: () => void;
  systemAudioSupport: SystemAudioSupport | null;
  systemAudioStatus: SystemAudioProbeStatus;
  systemAudioLevel: number;
  systemAudioMessage: string;
  onStartSystemAudioProbe: () => void;
  onStopSystemAudioProbe: () => void;
  onRefreshSystemAudioSupport: () => void;
  isLoading: boolean;
}) {
  const domainProfile = getDomainProfile(meetingContext);
  const prepThemes = getInterviewPrepThemes(meetingContext);
  const canStartMeeting = Boolean(linkedProfileDocument && isProfileDocumentReady(linkedProfileDocument));

  return (
    <>
      <section className="section-head">
        <div>
          <h1>{meetingContext.contextName}</h1>
          <p className="subcopy">
            {meetingContext.meetingTopic} - {linkedProfileDocument ? "profil referensi tersambung" : "profil referensi belum dipilih"}
          </p>
        </div>
        <div className="actions-row no-margin">
          <button className="secondary-btn" onClick={onBack}>Kembali ke Workspace</button>
          <button className="secondary-btn danger-btn" onClick={onDelete}>Hapus Konteks</button>
        </div>
      </section>

      <section className="grid two">
        <div className="panel">
          <h2>Ringkasan Meeting</h2>
          <div className="summary-box detail-grid">
            <div className="summary-item">
              <p className="summary-label">Ringkasan</p>
              <p>{getJdSummary(meetingContext)}</p>
              <p className="subcopy compact">{domainProfile.nicheDescription || "Konteks meeting akan mengikuti nama konteks, topik, dan brief yang tersimpan."}</p>
            </div>
            <div className="summary-item">
              <p className="summary-label">Yang Perlu Dipersiapkan</p>
              <ul className="theme-list">
                {prepThemes.map((theme) => (
                  <li key={theme}>{theme}</li>
                ))}
              </ul>
            </div>
            <div className="summary-item">
              <p className="summary-label">Riwayat Sesi Live</p>
              <div className="round-list">
                {liveMeetingSessions.length ? liveMeetingSessions.map((round) => (
                  <div className="round-row" key={round.id}>
                    <div>
                      <strong>Sesi meeting</strong>
                      <span>{round.endedAt ? "Selesai" : "Dimulai"} - {formatDate(round.startedAt)}</span>
                    </div>
                    {round.endedAt ? (
                      <button
                        className="secondary-btn small danger-btn"
                        onClick={() => onDeleteRound(round)}
                        disabled={isLoading}
                      >
                        Hapus
                      </button>
                    ) : (
                      <button
                        className="secondary-btn small"
                        onClick={() => onEndRound(round)}
                        disabled={isLoading}
                      >
                        Akhiri
                      </button>
                    )}
                  </div>
                )) : (
                  <p className="subcopy compact">Belum ada sesi meeting.</p>
                )}
              </div>
            </div>
            <details className="summary-item">
              <summary>Brief Meeting</summary>
              <p>{meetingContext.meetingBrief || "Belum ada brief meeting."}</p>
            </details>
            <details className="summary-item">
              <summary>Detail Tambahan</summary>
              {domainProfile.primaryDomain ? (
                <div className="detail-block">
                  <p className="summary-label">Fokus Meeting</p>
                  <strong>{domainProfile.primaryDomain}</strong>
                </div>
              ) : null}
              {domainProfile.seedConcepts.length ? (
                <div className="detail-block">
                  <p className="summary-label">Topik Terkait</p>
                  <div className="keywords compact-list">
                    {domainProfile.seedConcepts.slice(0, 5).map((concept) => (
                      <span className="pill" key={concept}>{concept}</span>
                    ))}
                  </div>
                </div>
              ) : null}
              {domainProfile.relevanceGuidance ? (
                <div className="detail-block">
                  <p className="summary-label">Catatan Relevansi</p>
                  <p className="clamped-copy">{domainProfile.relevanceGuidance}</p>
                </div>
              ) : null}
            </details>
          </div>
        </div>

        <aside className="panel">
          <h2>Mulai Sesi Meeting Baru</h2>
          <p className="subcopy">Pastikan audio meeting siap, lalu mulai sesi live.</p>
          <SystemAudioReadinessCard
            systemSupport={systemAudioSupport}
            systemStatus={systemAudioStatus}
            systemLevel={systemAudioLevel}
            systemMessage={systemAudioMessage}
            onStartSystemProbe={onStartSystemAudioProbe}
            onStopSystemProbe={onStopSystemAudioProbe}
            onRefreshSystemSupport={onRefreshSystemAudioSupport}
          />
          <div className="actions-row">
            <button className="primary-btn" onClick={onStartInterview} disabled={isLoading || !canStartMeeting}>
              Mulai Meeting
            </button>
          </div>
          <SessionProfilePicker
            profileDocuments={profileDocuments}
            selectedProfileDocumentId={meetingContext.profileDocumentId}
            linkedProfileDocument={linkedProfileDocument}
            onSelectProfileDocument={onSelectProfileDocument}
            isLoading={isLoading}
          />
        </aside>
      </section>
    </>
  );
}

function SessionProfilePicker({
  profileDocuments,
  selectedProfileDocumentId,
  linkedProfileDocument,
  onSelectProfileDocument,
  isLoading
}: {
  profileDocuments: ProfileDocument[];
  selectedProfileDocumentId: string;
  linkedProfileDocument: ProfileDocument | null;
  onSelectProfileDocument: (profileDocument: ProfileDocument) => void;
  isLoading: boolean;
}) {
  return (
    <section className="session-profile-picker">
      <div>
        <p className="summary-label">Profil Referensi Sesi</p>
        <h3>{linkedProfileDocument?.fileName || "Belum ada profil terhubung"}</h3>
        <p className="subcopy compact">Pilih dokumen profil yang akan dipakai untuk meeting ini.</p>
      </div>

      <div className="session-profile-list">
        {profileDocuments.length ? profileDocuments.map((profileDocument) => {
          const selected = profileDocument.id === selectedProfileDocumentId;
          const ready = isProfileDocumentReady(profileDocument);
          return (
            <div className={`session-profile-row ${selected ? "selected" : ""}`} key={profileDocument.id}>
              <div>
                <strong>{profileDocument.fileName}</strong>
                <p>{getSessionProfileMeta(profileDocument)}</p>
              </div>
              {selected ? (
                <span className="pill good">Dipakai</span>
              ) : (
                <button
                  className="secondary-btn small"
                  type="button"
                  onClick={() => onSelectProfileDocument(profileDocument)}
                  disabled={!ready || isLoading}
                >
                  Pakai
                </button>
              )}
            </div>
          );
        }) : (
          <p className="subcopy compact">Belum ada profil yang diupload.</p>
        )}
      </div>
    </section>
  );
}

function SystemAudioReadinessCard({
  systemSupport,
  systemStatus,
  systemLevel,
  systemMessage,
  onStartSystemProbe,
  onStopSystemProbe,
  onRefreshSystemSupport
}: {
  systemSupport: SystemAudioSupport | null;
  systemStatus: SystemAudioProbeStatus;
  systemLevel: number;
  systemMessage: string;
  onStartSystemProbe: () => void;
  onStopSystemProbe: () => void;
  onRefreshSystemSupport: () => void;
}) {
  return (
    <div className="audio-readiness">
      <div className="status-title-row">
        <p className="summary-label">Audio Meeting</p>
        <span className={`pill ${systemStatus === "ok" ? "good" : systemStatus === "error" || systemStatus === "missing" ? "danger" : "warn"}`}>
          {getSystemAudioStatusLabel(systemStatus)}
        </span>
      </div>
      <div className="audio-meter system">
        <div className="audio-meter-track" aria-hidden="true">
          <div className={`audio-meter-fill ${systemStatus}`} style={{ width: `${Math.round(systemLevel * 100)}%` }} />
        </div>
        <p className="subcopy compact">{getSystemAudioUserMessage(systemStatus, systemMessage)}</p>
        <div className="actions-row no-margin">
          <button
            className="secondary-btn small open-action-btn"
            onClick={onStartSystemProbe}
            disabled={systemStatus === "checking" || systemStatus === "unsupported" || systemStatus === "missing"}
          >
            {systemStatus === "checking" ? "Mengecek..." : "Cek Audio"}
          </button>
          <button className="secondary-btn small" onClick={onStopSystemProbe} disabled={systemStatus !== "checking"}>
            Berhenti
          </button>
          <button className="secondary-btn small" onClick={onRefreshSystemSupport} disabled={systemStatus === "checking"}>
            Cek Ulang
          </button>
        </div>
      </div>
    </div>
  );
}

function InterviewSessionPlaceholder({
  meetingContext,
  liveMeetingSession,
  onBack
}: {
  meetingContext: MeetingContext;
  liveMeetingSession: LiveMeetingSession;
  onBack: () => void;
}) {
  return (
    <main className="meeting-screen-placeholder">
      <section className="zoom-dummy-window">
        <div className="zoom-titlebar">
          <span>Live Meeting Session</span>
          <button className="secondary-btn small" onClick={onBack}>Back</button>
        </div>
        <div className="zoom-dummy-body">
          <div>
            <p className="eyebrow">Meeting placeholder</p>
            <h1>Sesi Meeting Dimulai</h1>
            <p className="subcopy">{meetingContext.contextName} - {meetingContext.meetingTopic}</p>
          </div>
          <div className="summary-box">
        <div className="summary-item">
              <p className="summary-label">Status</p>
              <p>Browser fallback only. Di Electron, Start Meeting seharusnya membuka floating overlay window terpisah.</p>
        </div>
        <div className="summary-item">
              <p className="summary-label">Dimulai Pada</p>
              <p>{formatDate(liveMeetingSession.startedAt)}</p>
            </div>
        </div>
      </div>
    </section>
    </main>
  );
}

function ProfileDocumentProcessingStatus({
  profileDocument,
  compact = false,
  onRetry
}: {
  profileDocument: ProfileDocument;
  compact?: boolean;
  onRetry?: () => void;
}) {
  return (
    <AiStatusCard
      title={getProfileDocumentProcessingTitle(profileDocument)}
      status={profileDocument.processingStatus}
      message={getProfileDocumentProcessingDetail(profileDocument)}
      compact={compact}
      action={profileDocument.processingStatus === "failed" && onRetry ? (
        <button className="secondary-btn small" type="button" onClick={onRetry}>
          Coba Lagi
        </button>
      ) : undefined}
    />
  );
}

function AiStatusCard({
  title,
  status,
  message,
  compact = false,
  action
}: {
  title: string;
  status: ProfileDocument["processingStatus"] | "processing";
  message: string;
  compact?: boolean;
  action?: ReactNode;
}) {
  return (
    <div className={`status-card ai ${status}`}>
      <div className="status-title-row">
        <strong>{title}</strong>
        <span className={`pill ${status === "ready" ? "good" : status === "failed" ? "danger" : "warn"}`}>
          {status}
        </span>
      </div>
      <p>{message}</p>
      {status === "processing" ? (
        <div className="progress-track" aria-hidden="true">
          <div className="progress-fill" />
        </div>
      ) : null}
      {!compact && status !== "ready" ? (
        <p className="subcopy compact">Konteks meeting baru dikunci sampai status profil menjadi ready.</p>
      ) : null}
      {action ? <div className="actions-row no-margin">{action}</div> : null}
    </div>
  );
}

function getDomainProfile(meetingContext: MeetingContext): DomainProfile {
  const result = getMeetingContextAiResult(meetingContext);
  if (result?.domainProfile) {
    return normalizeDomainProfile(result.domainProfile);
  }

  if (result?.domainKeywords?.length) {
    return normalizeDomainProfile({
      primaryDomain: meetingContext.meetingTopic,
      nicheDescription: "Konteks ini memakai format AI lama. Seed concepts berikut hanya referensi sementara, bukan runtime keyword chips.",
      seedConcepts: result.domainKeywords,
      inScopeConcepts: result.domainKeywords,
      outOfScopeConcepts: [],
      relevanceGuidance: "Buat ulang konteks meeting untuk mendapatkan relevance boundary versi terbaru."
    });
  }

  return normalizeDomainProfile({
    primaryDomain: meetingContext.meetingTopic,
    nicheDescription: meetingContext.meetingBrief
      ? "Domain profile belum tersedia. Buat ulang konteks meeting agar AI membangun relevance boundary yang lebih tepat."
      : "Domain profile belum tersedia karena brief meeting kosong.",
    seedConcepts: [],
    inScopeConcepts: [],
    outOfScopeConcepts: [],
    relevanceGuidance: "Runtime keyword hanya boleh muncul setelah transcript live terbukti relevan dengan konteks meeting."
  });
}

function getInterviewPrepThemes(meetingContext: MeetingContext) {
  const result = getMeetingContextAiResult(meetingContext);
  const themes = result?.preparationThemes || result?.likelyInterviewThemes;
  return themes?.length ? compactTextList(themes, 3, 90) : ["Validasi scope meeting", "Hubungkan pengalaman user dengan konteks meeting"];
}

function getDashboardMeetingContextFocus(meetingContext: MeetingContext) {
  const domainProfile = getDomainProfile(meetingContext);
  const focus = domainProfile.nicheDescription || domainProfile.primaryDomain || getJdSummary(meetingContext) || meetingContext.meetingTopic;
  return truncateText(focus, 72);
}

function getJdSummary(meetingContext: MeetingContext) {
  return getMeetingContextAiResult(meetingContext)?.meetingSummary || meetingContext.meetingContextText || "Konteks meeting belum tersedia.";
}

function getCandidateSummary(profileDocument: ProfileDocument) {
  if (profileDocument.processingStatus === "processing") {
    return "AI sedang membaca profil dan membuat ringkasan user.";
  }
  if (profileDocument.processingStatus === "failed") {
    return "Ringkasan profil belum tersedia karena AI processing gagal.";
  }
  return getProfileDocumentAiResult(profileDocument)?.userProfileSummary || profileDocument.readyContext || "Ringkasan profil belum tersedia.";
}

function isProfileDocumentReady(profileDocument: ProfileDocument | null) {
  return profileDocument?.processingStatus === "ready";
}

function getProfileDocumentStatusMessage(profileDocument: ProfileDocument | null) {
  if (!profileDocument) return "Belum ada profil default. Upload profil untuk memulai.";
  if (profileDocument.processingStatus === "processing") return `${profileDocument.fileName} sedang diproses AI. Tunggu sampai ready sebelum membuat konteks meeting.`;
  if (profileDocument.processingStatus === "failed") return `${profileDocument.fileName} gagal diproses AI. Klik coba lagi sebelum membuat konteks meeting.`;
  return "Profil default sudah diproses AI dan siap dipakai untuk konteks meeting berikutnya.";
}

function getProfileDocumentProcessingTitle(profileDocument: ProfileDocument) {
  if (profileDocument.processingStatus === "processing") return "AI Memproses";
  if (profileDocument.processingStatus === "failed") return "AI Gagal";
  if (profileDocument.processingStatus === "uploaded") return "Diupload";
  return "AI Ready";
}

function getProfileDocumentProcessingDetail(profileDocument: ProfileDocument) {
  if (profileDocument.processingStatus === "processing") {
    return "AI sedang membaca profil, mengekstrak pengalaman, preferensi, dan konteks user yang bisa dipakai saat meeting.";
  }
  if (profileDocument.processingStatus === "failed") {
    return profileDocument.processingError || "AI gagal memproses profil. Coba lagi sebelum membuat konteks meeting.";
  }
  if (profileDocument.processingStatus === "uploaded") {
    return "Profil sudah diupload dan menunggu AI processing.";
  }
  return "Profil sudah diproses AI dan siap dipakai untuk konteks meeting.";
}

function getSessionProfileMeta(profileDocument: ProfileDocument) {
  const uploadedAt = `Diupload ${formatDate(profileDocument.createdAt)}`;
  if (profileDocument.processingStatus === "ready") {
    return `${uploadedAt} - siap dipakai`;
  }
  if (profileDocument.processingStatus === "failed") {
    return `${uploadedAt} - gagal diproses`;
  }
  if (profileDocument.processingStatus === "processing") {
    return `${uploadedAt} - sedang diproses`;
  }
  return `${uploadedAt} - menunggu processing`;
}

function getSystemAudioStatusLabel(status: SystemAudioProbeStatus) {
  if (status === "ok") return "Siap";
  if (status === "checking") return "Mengecek";
  if (status === "silent") return "Belum ada suara";
  if (status === "missing") return "Belum siap";
  if (status === "unsupported") return "Tidak tersedia";
  if (status === "stopped") return "Berhenti";
  if (status === "error") return "Gagal";
  return "Belum dicek";
}

function getSystemAudioUserMessage(status: SystemAudioProbeStatus, _fallbackMessage: string) {
  if (status === "ok") return "Audio dari meeting siap didengar.";
  if (status === "checking") return "Sedang mengecek audio meeting...";
  if (status === "silent") return "Belum ada suara meeting terdeteksi. Putar suara dari meeting, lalu cek ulang.";
  if (status === "missing") return "Komponen audio belum siap. Restart aplikasi, lalu coba lagi.";
  if (status === "unsupported") return "Pengecekan audio otomatis hanya tersedia di Windows.";
  if (status === "stopped") return "Pengecekan audio dihentikan.";
  if (status === "error") return "Audio meeting belum bisa dicek. Coba cek ulang.";
  return "Klik Cek Audio sebelum memulai meeting.";
}


type ProfileDocumentAiEnvelope = {
  result?: {
    userProfileSummary?: string;
  };
};

type MeetingContextAiEnvelope = {
  result?: {
    meetingSummary?: string;
    domainProfile?: Partial<DomainProfile>;
    preparationThemes?: string[];
    domainKeywords?: string[];
    likelyInterviewThemes?: string[];
  };
};

type DomainProfile = {
  primaryDomain: string;
  nicheDescription: string;
  inScopeConcepts: string[];
  outOfScopeConcepts: string[];
  seedConcepts: string[];
  relevanceGuidance: string;
};

function normalizeDomainProfile(profile: Partial<DomainProfile>): DomainProfile {
  return {
    primaryDomain: truncateText(profile.primaryDomain || "", 90),
    nicheDescription: truncateText(profile.nicheDescription || "", 260),
    inScopeConcepts: compactTextList(profile.inScopeConcepts, 8, 80),
    outOfScopeConcepts: compactTextList(profile.outOfScopeConcepts, 5, 80),
    seedConcepts: compactTextList(profile.seedConcepts, 5, 42),
    relevanceGuidance: truncateText(profile.relevanceGuidance || "", 360)
  };
}

function compactTextList(items: unknown, maxItems: number, maxCharacters: number) {
  if (!Array.isArray(items)) {
    return [];
  }

  return Array.from(new Set(items
    .filter((item): item is string => typeof item === "string")
    .map((item) => truncateText(item, maxCharacters))
    .filter(Boolean)))
    .slice(0, maxItems);
}

function truncateText(value: string, maxCharacters: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxCharacters) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxCharacters - 1)).trimEnd()}…`;
}

function getProfileDocumentAiResult(profileDocument: ProfileDocument) {
  const envelope = profileDocument.summaryJson as ProfileDocumentAiEnvelope | null;
  return envelope && typeof envelope === "object" ? envelope.result : undefined;
}

function getMeetingContextAiResult(meetingContext: MeetingContext) {
  const envelope = meetingContext.meetingSummaryJson as MeetingContextAiEnvelope | null;
  return envelope && typeof envelope === "object" ? envelope.result : undefined;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}
