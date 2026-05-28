import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import type { Application, Cv, InterviewRound, InterviewStage } from "@interview-app/shared";
import orvikoLogo from "../../assets/orviko-logo.png";
import { createApplication, deleteApplication as deleteApplicationRequest, getApplications } from "../applications/application-api.js";
import { deleteInterviewRound, endInterview, getInterviewRounds, startInterview } from "../interviews/interview-api.js";
import { deleteCv, getActiveCv, getCvList, retryCvProcessing, setActiveCv, uploadCv } from "./cv-api.js";

type LoadState = "idle" | "loading" | "uploading" | "processingApplication" | "error";
type WorkspaceView = "dashboard" | "createApplication" | "applicationDetail" | "interview";
type SystemAudioProbeStatus = "unsupported" | "missing" | "idle" | "checking" | "ok" | "silent" | "error" | "stopped";

type OverlayEndPayload = {
  interviewRoundId?: string;
  applicationId?: string;
  transcriptText?: string;
};

const DEFAULT_MEETING_STAGE: InterviewStage = "OTHER";

export function CvDashboard() {
  const [activeCv, setActiveCvState] = useState<Cv | null>(null);
  const [cvs, setCvs] = useState<Cv[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null);
  const [interviewRounds, setInterviewRounds] = useState<InterviewRound[]>([]);
  const [activeInterviewRound, setActiveInterviewRound] = useState<InterviewRound | null>(null);
  const [status, setStatus] = useState<LoadState>("idle");
  const [message, setMessage] = useState("Hubungkan backend API, lalu upload profil pertama untuk mulai membuat referensi user.");
  const [view, setView] = useState<WorkspaceView>("dashboard");
  const [systemAudioSupport, setSystemAudioSupport] = useState<SystemAudioSupport | null>(null);
  const [systemAudioStatus, setSystemAudioStatus] = useState<SystemAudioProbeStatus>("unsupported");
  const [systemAudioLevel, setSystemAudioLevel] = useState(0);
  const [systemAudioMessage, setSystemAudioMessage] = useState("Audio meeting belum dicek.");
  async function refreshCvs(options: { silent?: boolean } = {}) {
    if (!options.silent) {
      setStatus("loading");
    }
    try {
      const [activeResponse, listResponse] = await Promise.all([
        getActiveCv(),
        getCvList()
      ]);
      setActiveCvState(activeResponse.cv);
      setCvs(listResponse.cvs);
      if (!options.silent) {
        setStatus("idle");
      }
      setMessage(getCvStatusMessage(activeResponse.cv));
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
      void handleOverlayInterviewEnded(payload as OverlayEndPayload);
    });
  }, [selectedApplication?.id]);

  useEffect(() => {
    if (activeCv?.processingStatus !== "processing") return;

    const pollId = window.setInterval(() => {
      void refreshCvs({ silent: true });
    }, 1600);

    return () => window.clearInterval(pollId);
  }, [activeCv?.id, activeCv?.processingStatus]);

  async function refreshWorkspace() {
    await Promise.all([
      refreshCvs(),
      refreshApplications()
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

  async function refreshApplications() {
    try {
      const response = await getApplications();
      setApplications(response.applications);
      setSelectedApplication((current) => current ? response.applications.find((item) => item.id === current.id) || null : null);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Gagal memuat konteks meeting.");
    }
  }

  async function refreshInterviewRounds(applicationId: string) {
    try {
      const response = await getInterviewRounds(applicationId);
      setInterviewRounds(response.interviewRounds);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Gagal memuat sesi meeting.");
    }
  }

  function selectApplication(application: Application) {
    setSelectedApplication(application);
    setActiveInterviewRound(null);
    setView("applicationDetail");
    void refreshInterviewRounds(application.id);
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    setStatus("uploading");
    setMessage(`Mengupload ${file.name}...`);

    try {
      const response = await uploadCv(file);
      setActiveCvState(response.cv);
      await refreshCvs();
      setMessage(`${response.cv.fileName} berhasil diupload. AI sedang memproses profil sebelum bisa dipakai membuat konteks meeting.`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Upload profil gagal.");
    }
  }

  async function handleSetActive(cvId: string) {
    setStatus("loading");
    try {
      const response = await setActiveCv(cvId);
      await refreshCvs();
      setMessage(`${response.cv.fileName} sekarang menjadi profil aktif.`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Gagal mengganti profil aktif.");
    }
  }

  async function handleRetryCvProcessing(cvId: string) {
    setStatus("loading");
    try {
      const response = await retryCvProcessing(cvId);
      setActiveCvState(response.cv);
      await refreshCvs();
      setStatus("idle");
      setMessage(`${response.cv.fileName} sedang diproses ulang oleh AI.`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Gagal retry AI processing profil.");
    }
  }

  async function handleDeleteCv(cv: Cv) {
    const activeNote = cv.isActive ? " Profil terbaru lain akan otomatis menjadi profil aktif jika tersedia." : "";
    const confirmed = window.confirm(`Hapus profil "${cv.fileName}"? File upload dan hasil AI processing profil ini akan dihapus.${activeNote}`);
    if (!confirmed) {
      return;
    }

    setStatus("loading");
    try {
      await deleteCv(cv.id);
      await refreshCvs();
      setStatus("idle");
      setMessage(`${cv.fileName} berhasil dihapus.`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Gagal menghapus profil.");
    }
  }

  async function handleCreateApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const companyName = String(formData.get("companyName") || "").trim();
    const roleTitle = String(formData.get("roleTitle") || "").trim();
    const jobDescription = String(formData.get("jobDescription") || "").trim();

    if (!companyName || !roleTitle) {
      setStatus("error");
      setMessage("Nama konteks dan topik meeting wajib diisi.");
      return;
    }

    if (!isCvReady(activeCv)) {
      setStatus("error");
      setMessage("Tunggu profil aktif selesai diproses AI sebelum membuat konteks meeting.");
      return;
    }

    setStatus("processingApplication");
    try {
      const response = await createApplication({
        companyName,
        roleTitle,
        jobDescription
      });
      form.reset();
      await refreshApplications();
      setSelectedApplication(response.application);
      await refreshInterviewRounds(response.application.id);
      setView("applicationDetail");
      setStatus("idle");
      setMessage(`${response.application.companyName} - ${response.application.roleTitle} berhasil dibuat.`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Gagal membuat konteks meeting.");
    }
  }

  async function handleDeleteApplication(application: Application) {
    const companyRole = `${application.companyName} - ${application.roleTitle}`;
    const confirmed = window.confirm(`Hapus konteks meeting "${companyRole}" beserta semua sesi live di dalamnya?`);
    if (!confirmed) {
      return;
    }

    setStatus("loading");
    try {
      await deleteApplicationRequest(application.id);
      await refreshApplications();

      if (selectedApplication?.id === application.id) {
        setSelectedApplication(null);
        setInterviewRounds([]);
        setActiveInterviewRound(null);
        setView("dashboard");
      }

      setStatus("idle");
      setMessage(`${companyRole} berhasil dihapus.`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Gagal menghapus konteks meeting.");
    }
  }

  async function handleDeleteInterviewRound(round: InterviewRound) {
    if (!round.endedAt) {
      setStatus("error");
      setMessage("Sesi meeting yang masih berjalan harus diakhiri dulu sebelum dihapus.");
      return;
    }

    const confirmed = window.confirm(`Hapus sesi ${round.stageType} dari ${formatDate(round.startedAt)}? Transkrip sesi ini ikut terhapus.`);
    if (!confirmed) {
      return;
    }

    setStatus("loading");
    try {
      await deleteInterviewRound(round.id);
      if (activeInterviewRound?.id === round.id) {
        setActiveInterviewRound(null);
      }
      await refreshInterviewRounds(round.applicationId);
      setStatus("idle");
      setMessage(`Sesi ${round.stageType} berhasil dihapus.`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Gagal menghapus sesi meeting.");
    }
  }

  async function handleStartInterview(application: Application) {
    setStatus("loading");
    try {
      const response = await startInterview({
        applicationId: application.id,
        stageType: DEFAULT_MEETING_STAGE
      });
      setActiveInterviewRound(response.interviewRound);

      if (window.interviewDesktop?.openOverlay) {
        try {
          const hasSystemAudio = systemAudioStatus === "ok";
          await window.interviewDesktop.openOverlay({
            interviewRoundId: response.interviewRound.id,
            applicationId: application.id,
            companyName: application.companyName,
            roleTitle: application.roleTitle,
            stageType: DEFAULT_MEETING_STAGE,
            audioStatus: hasSystemAudio ? "ready" : "waiting",
            audioDeviceLabel: hasSystemAudio ? "Active system output (WASAPI loopback)" : "System audio loopback",
            audioSourceKind: "system-loopback",
            domainLabel: response.realtimeContext?.domainProfile.primaryDomain || getDomainProfile(application).primaryDomain,
            realtimeContext: response.realtimeContext
          });
        } catch (overlayError) {
          await endInterview(response.interviewRound.id, {
            transcriptText: "Sesi meeting otomatis ditutup karena floating overlay gagal dibuka."
          });
          await refreshInterviewRounds(application.id);
          setStatus("error");
          setMessage(overlayError instanceof Error ? overlayError.message : "Floating overlay gagal dibuka. Sesi meeting sudah ditutup otomatis.");
          return;
        }
        await refreshInterviewRounds(application.id);
        setStatus("idle");
        setMessage("Sesi meeting dimulai. Floating overlay aktif.");
      } else if (window.interviewDesktop) {
        await endInterview(response.interviewRound.id, {
          transcriptText: "Sesi meeting otomatis ditutup karena Electron overlay bridge belum tersedia."
        });
        await refreshInterviewRounds(application.id);
        setStatus("error");
        setMessage("Electron overlay bridge belum tersedia. Restart dev:desktop supaya preload/main Electron terbaru aktif.");
      } else {
        await refreshInterviewRounds(application.id);
        setView("interview");
        setStatus("idle");
        setMessage("Sesi meeting dimulai. Browser fallback aktif.");
      }
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Gagal memulai sesi meeting.");
    }
  }

  async function handleOverlayInterviewEnded(payload: OverlayEndPayload) {
    if (!payload.interviewRoundId) {
      setMessage("Overlay ditutup, tapi ID sesi meeting tidak ditemukan.");
      return;
    }

    setStatus("loading");
    try {
      const response = await endInterview(payload.interviewRoundId, {
        transcriptText: payload.transcriptText
      });
      setActiveInterviewRound(response.interviewRound);
      const applicationIdToRefresh = payload.applicationId || response.interviewRound.applicationId;
      if (selectedApplication?.id === applicationIdToRefresh) {
        await refreshInterviewRounds(applicationIdToRefresh);
      } else {
        await refreshApplications();
      }
      setStatus("idle");
      setMessage("Sesi meeting berakhir. Transkrip terbaru sudah tersimpan di sesi.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Gagal mengakhiri sesi meeting.");
    }
  }

  useEffect(() => {
    if (selectedApplication) {
      void refreshInterviewRounds(selectedApplication.id);
    } else {
      setInterviewRounds([]);
    }
  }, [selectedApplication?.id]);

  if (view === "interview" && selectedApplication && activeInterviewRound) {
    return (
      <InterviewSessionPlaceholder
        application={selectedApplication}
        interviewRound={activeInterviewRound}
        onBack={() => setView("applicationDetail")}
      />
    );
  }

  if (view === "createApplication") {
    return (
      <Shell activeCv={activeCv}>
        <CreateApplicationView
          activeCv={activeCv}
          onCancel={() => setView("dashboard")}
          onSubmit={(event) => void handleCreateApplication(event)}
          isLoading={status === "processingApplication"}
        />
      </Shell>
    );
  }

  if (view === "applicationDetail" && selectedApplication) {
    return (
      <Shell activeCv={activeCv}>
        <ApplicationDetailView
          application={selectedApplication}
          interviewRounds={interviewRounds}
          onBack={() => setView("dashboard")}
          onDelete={() => void handleDeleteApplication(selectedApplication)}
          onDeleteRound={(round) => void handleDeleteInterviewRound(round)}
          onStartInterview={() => void handleStartInterview(selectedApplication)}
          systemAudioSupport={systemAudioSupport}
          systemAudioStatus={systemAudioStatus}
          systemAudioLevel={systemAudioLevel}
          systemAudioMessage={systemAudioMessage}
          onStartSystemAudioProbe={() => void startSystemAudioProbe()}
          onStopSystemAudioProbe={() => void stopSystemAudioProbe()}
          onRefreshSystemAudioSupport={() => void refreshSystemAudioSupport()}
          isLoading={status === "loading"}
        />
      </Shell>
    );
  }

  return (
    <Shell activeCv={activeCv}>
      <section className="section-head">
        <div>
          <h1>Meeting Workspace</h1>
        </div>
        <button
          className="primary-btn icon-btn new-session-btn"
          onClick={() => setView("createApplication")}
          disabled={!isCvReady(activeCv)}
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

          {applications.length ? (
            <div className="dashboard-table">
              {applications.map((application) => {
                return (
                  <article className="dashboard-app-row" key={application.id}>
                    <div className="dashboard-app-title">
                      <div className="dashboard-app-title-line">
                        <strong>{application.companyName} - {application.roleTitle}</strong>
                      </div>
                      <span>Fokus: {getDashboardApplicationFocus(application)}</span>
                    </div>

                    <div className="dashboard-row-actions">
                      <button
                        className="secondary-btn dashboard-action-btn open-action-btn"
                        onClick={() => selectApplication(application)}
                      >
                        Buka
                      </button>
                      <button
                        className="secondary-btn small danger-btn"
                        onClick={() => void handleDeleteApplication(application)}
                        disabled={status === "loading" || status === "processingApplication" || status === "uploading"}
                      >
                        Hapus
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="dashboard-empty-applications">
              <div className="eyebrow">Meeting workspace</div>
              <h2>Belum ada konteks meeting</h2>
              <p className="subcopy">Upload profil dulu, lalu buat konteks pertama dengan nama meeting, topik, dan brief yang relevan.</p>
            </div>
          )}
        </section>

        <ProfileContextPanel
          activeCv={activeCv}
          cvs={cvs}
          status={status}
          message={message}
          onUpload={handleUpload}
          onSetActive={(cvId) => void handleSetActive(cvId)}
          onRetryProcessing={(cvId) => void handleRetryCvProcessing(cvId)}
          onDeleteCv={(cv) => void handleDeleteCv(cv)}
        />
      </section>
    </Shell>
  );
}

function Shell({ activeCv, children }: { activeCv: Cv | null; children: ReactNode }) {
  return (
    <main className="workspace">
      <nav className="topbar">
        <div className="brand">
          <img className="brand-logo" src={orvikoLogo} alt="" aria-hidden="true" />
          <strong>Orviko</strong>
        </div>
        <div className="profile-pill">
          <span>Profil aktif: {activeCv?.fileName || "Belum ada"}</span>
          <span className="avatar" aria-hidden="true" />
        </div>
      </nav>
      {children}
    </main>
  );
}

function CreateApplicationView({
  activeCv,
  onCancel,
  onSubmit,
  isLoading
}: {
  activeCv: Cv | null;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isLoading: boolean;
}) {
  const cvReady = isCvReady(activeCv);

  return (
    <>
      <section className="section-head">
        <div>
          <h1>Buat Konteks Meeting</h1>
          <p className="subcopy">Konteks meeting menyimpan brief, topik, profil aktif, dan batas relevansi untuk semua sesi live berikutnya.</p>
        </div>
        <button className="secondary-btn" onClick={onCancel}>Kembali</button>
      </section>

      <section className="grid two">
        <form className="panel field-stack" onSubmit={onSubmit}>
          {!cvReady ? (
            <AiStatusCard
              title="Profil belum siap"
              status={activeCv?.processingStatus || "failed"}
              message="Tunggu AI processing profil selesai sebelum membuat konteks meeting baru."
            />
          ) : null}
              <label className="field">
                <span>Nama konteks</span>
            <input name="companyName" placeholder="Weekly Product Sync" defaultValue="" />
              </label>
              <label className="field">
                <span>Topik meeting</span>
            <input name="roleTitle" placeholder="Roadmap planning" defaultValue="" />
              </label>
              <label className="field">
                <span>Brief / konteks meeting</span>
            <textarea name="jobDescription" placeholder="Paste agenda, notes, dokumen, atau konteks penting di sini..." />
              </label>
              <div className="summary-item">
                <p className="summary-label">Profil Aktif</p>
                <strong>{activeCv?.fileName || "Belum ada profil aktif"}</strong>
                <p className="subcopy compact">Konteks meeting akan memakai profil aktif saat ini.</p>
              </div>
          {activeCv ? <CvProcessingStatus cv={activeCv} compact /> : null}
          <button className="primary-btn" type="submit" disabled={!cvReady || isLoading}>
                {isLoading ? "Menganalisis konteks..." : "Simpan Konteks Meeting"}
              </button>
            </form>

        <aside className="panel">
          <h2>AI Processing</h2>
          <p className="subcopy">Saat disimpan, backend akan membuat ringkasan meeting, batas relevansi, dan konteks persiapan dari profil aktif + brief meeting.</p>
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
  activeCv,
  cvs,
  status,
  message,
  onUpload,
  onSetActive,
  onRetryProcessing,
  onDeleteCv
}: {
  activeCv: Cv | null;
  cvs: Cv[];
  status: LoadState;
  message: string;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onSetActive: (cvId: string) => void;
  onRetryProcessing: (cvId: string) => void;
  onDeleteCv: (cv: Cv) => void;
}) {
  const historyItems = cvs.length ? cvs : activeCv ? [activeCv] : [];

  return (
    <section className="panel dashboard-panel profile-panel-home">
      <div className="panel-head dashboard-panel-head">
        <div>
          <h2>Profil & Referensi User</h2>
        </div>
      </div>

      <div className="dashboard-profile-grid">
        <article className="dashboard-profile-card">
          <b className="summary-label">Profil Aktif</b>
          {activeCv ? (
            <>
              <strong>{activeCv.fileName}</strong>
              <p>Diupload {formatDate(activeCv.createdAt)}. File terbaru menjadi referensi user utama setelah AI processing selesai.</p>
            </>
          ) : (
            <>
              <strong>Belum ada profil aktif</strong>
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

        <article className={`dashboard-profile-card dashboard-status-card ${activeCv?.processingStatus || "uploaded"}`}>
          <b className="summary-label">{activeCv ? getCvProcessingTitle(activeCv) : "AI Processing"}</b>
          <strong>{activeCv ? getCvProcessingTitle(activeCv) : "Belum ada profil aktif"}</strong>
          <p>{activeCv ? getCvProcessingDetail(activeCv) : "AI processing akan berjalan setelah profil pertama diupload."}</p>
          {activeCv?.processingStatus === "failed" ? (
            <div className="dashboard-card-actions">
              <button className="secondary-btn small" type="button" onClick={() => onRetryProcessing(activeCv.id)}>
                Coba Lagi
              </button>
            </div>
          ) : null}
        </article>

        <article className="dashboard-profile-card">
          <b className="summary-label">Ringkasan Profil</b>
          <strong>{activeCv?.fileName || "Profile summary"}</strong>
          <p>{activeCv ? getCandidateSummary(activeCv) : "Upload profil untuk membuat ringkasan user yang dipakai ulang di semua konteks meeting."}</p>
        </article>
      </div>

      {historyItems.length ? (
        <div className="dashboard-history-panel">
          <h3>Riwayat Versi Profil</h3>
          <div className="dashboard-cv-history">
            {historyItems.map((cv) => (
              <div className="dashboard-cv-row" key={cv.id}>
                <div>
                  <strong>{cv.fileName}</strong>
                  <p>{cv.isActive ? "Aktif" : "Diproses"} - {cv.processingStatus} - diupload {formatDate(cv.createdAt)}</p>
                </div>

                <div className="dashboard-cv-actions">
                  {cv.isActive ? (
                    <span className={`pill ${cv.processingStatus === "ready" ? "good" : cv.processingStatus === "failed" ? "danger" : "warn"}`}>
                      active
                    </span>
                  ) : (
                    <button className="secondary-btn small" onClick={() => onSetActive(cv.id)}>
                      Jadikan Aktif
                    </button>
                  )}
                  <button
                    className="secondary-btn small danger-btn"
                    onClick={() => onDeleteCv(cv)}
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

function ApplicationDetailView({
  application,
  interviewRounds,
  onBack,
  onDelete,
  onDeleteRound,
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
  application: Application;
  interviewRounds: InterviewRound[];
  onBack: () => void;
  onDelete: () => void;
  onDeleteRound: (round: InterviewRound) => void;
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
  const domainProfile = getDomainProfile(application);
  const prepThemes = getInterviewPrepThemes(application);

  return (
    <>
      <section className="section-head">
        <div>
          <h1>{application.companyName}</h1>
          <p className="subcopy">{application.roleTitle} - profil aktif tersambung</p>
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
              <p>{getJdSummary(application)}</p>
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
                {interviewRounds.length ? interviewRounds.map((round) => (
                  <div className="round-row" key={round.id}>
                    <div>
                      <strong>Sesi meeting</strong>
                      <span>{round.endedAt ? "Selesai" : "Dimulai"} - {formatDate(round.startedAt)}</span>
                    </div>
                    <button
                      className="secondary-btn small danger-btn"
                      onClick={() => onDeleteRound(round)}
                      disabled={!round.endedAt || isLoading}
                    >
                      Hapus
                    </button>
                  </div>
                )) : (
                  <p className="subcopy compact">Belum ada sesi meeting.</p>
                )}
              </div>
            </div>
            <details className="summary-item">
              <summary>Brief Meeting</summary>
              <p>{application.jobDescription || "Belum ada brief meeting."}</p>
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
            <button className="primary-btn" onClick={onStartInterview} disabled={isLoading}>
              Mulai Meeting
            </button>
          </div>
        </aside>
      </section>
    </>
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
  application,
  interviewRound,
  onBack
}: {
  application: Application;
  interviewRound: InterviewRound;
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
            <p className="subcopy">{application.companyName} - {application.roleTitle}</p>
          </div>
          <div className="summary-box">
        <div className="summary-item">
              <p className="summary-label">Status</p>
              <p>Browser fallback only. Di Electron, Start Meeting seharusnya membuka floating overlay window terpisah.</p>
        </div>
        <div className="summary-item">
              <p className="summary-label">Dimulai Pada</p>
              <p>{formatDate(interviewRound.startedAt)}</p>
            </div>
        </div>
      </div>
    </section>
    </main>
  );
}

function CvProcessingStatus({
  cv,
  compact = false,
  onRetry
}: {
  cv: Cv;
  compact?: boolean;
  onRetry?: () => void;
}) {
  return (
    <AiStatusCard
      title={getCvProcessingTitle(cv)}
      status={cv.processingStatus}
      message={getCvProcessingDetail(cv)}
      compact={compact}
      action={cv.processingStatus === "failed" && onRetry ? (
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
  status: Cv["processingStatus"] | "processing";
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

function getDomainProfile(application: Application): DomainProfile {
  const result = getApplicationAiResult(application);
  if (result?.domainProfile) {
    return normalizeDomainProfile(result.domainProfile);
  }

  if (result?.domainKeywords?.length) {
    return normalizeDomainProfile({
      primaryDomain: application.roleTitle,
      nicheDescription: "Konteks ini memakai format AI lama. Seed concepts berikut hanya referensi sementara, bukan runtime keyword chips.",
      seedConcepts: result.domainKeywords,
      inScopeConcepts: result.domainKeywords,
      outOfScopeConcepts: [],
      relevanceGuidance: "Buat ulang konteks meeting untuk mendapatkan relevance boundary versi terbaru."
    });
  }

  return normalizeDomainProfile({
    primaryDomain: application.roleTitle,
    nicheDescription: application.jobDescription
      ? "Domain profile belum tersedia. Buat ulang konteks meeting agar AI membangun relevance boundary yang lebih tepat."
      : "Domain profile belum tersedia karena brief meeting kosong.",
    seedConcepts: [],
    inScopeConcepts: [],
    outOfScopeConcepts: [],
    relevanceGuidance: "Runtime keyword hanya boleh muncul setelah transcript live terbukti relevan dengan konteks meeting."
  });
}

function getInterviewPrepThemes(application: Application) {
  const result = getApplicationAiResult(application);
  const themes = result?.interviewPrepThemes || result?.likelyInterviewThemes;
  return themes?.length ? compactTextList(themes, 3, 90) : ["Validasi scope meeting", "Hubungkan pengalaman user dengan konteks meeting"];
}

function getDashboardApplicationFocus(application: Application) {
  const domainProfile = getDomainProfile(application);
  const focus = domainProfile.nicheDescription || domainProfile.primaryDomain || getJdSummary(application) || application.roleTitle;
  return truncateText(focus, 72);
}

function getJdSummary(application: Application) {
  return getApplicationAiResult(application)?.jdSummary || application.companyContext || "Konteks meeting belum tersedia.";
}

function getCandidateSummary(cv: Cv) {
  if (cv.processingStatus === "processing") {
    return "AI sedang membaca profil dan membuat ringkasan user.";
  }
  if (cv.processingStatus === "failed") {
    return "Ringkasan profil belum tersedia karena AI processing gagal.";
  }
  return getCvAiResult(cv)?.candidateSummary || cv.readyContext || "Ringkasan profil belum tersedia.";
}

function isCvReady(cv: Cv | null) {
  return cv?.processingStatus === "ready";
}

function getCvStatusMessage(cv: Cv | null) {
  if (!cv) return "Belum ada profil aktif. Upload profil untuk memulai.";
  if (cv.processingStatus === "processing") return `${cv.fileName} sedang diproses AI. Tunggu sampai ready sebelum membuat konteks meeting.`;
  if (cv.processingStatus === "failed") return `${cv.fileName} gagal diproses AI. Klik coba lagi sebelum membuat konteks meeting.`;
  return "Profil aktif sudah diproses AI dan siap dipakai untuk konteks meeting berikutnya.";
}

function getCvProcessingTitle(cv: Cv) {
  if (cv.processingStatus === "processing") return "AI Memproses";
  if (cv.processingStatus === "failed") return "AI Gagal";
  if (cv.processingStatus === "uploaded") return "Diupload";
  return "AI Ready";
}

function getCvProcessingDetail(cv: Cv) {
  if (cv.processingStatus === "processing") {
    return "AI sedang membaca profil, mengekstrak pengalaman, preferensi, dan konteks user yang bisa dipakai saat meeting.";
  }
  if (cv.processingStatus === "failed") {
    return cv.processingError || "AI gagal memproses profil. Coba lagi sebelum membuat konteks meeting.";
  }
  if (cv.processingStatus === "uploaded") {
    return "Profil sudah diupload dan menunggu AI processing.";
  }
  return "Profil sudah diproses AI dan siap dipakai untuk konteks meeting.";
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


type CvAiEnvelope = {
  result?: {
    candidateSummary?: string;
  };
};

type ApplicationAiEnvelope = {
  result?: {
    jdSummary?: string;
    domainProfile?: Partial<DomainProfile>;
    interviewPrepThemes?: string[];
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

function getCvAiResult(cv: Cv) {
  const envelope = cv.summaryJson as CvAiEnvelope | null;
  return envelope && typeof envelope === "object" ? envelope.result : undefined;
}

function getApplicationAiResult(application: Application) {
  const envelope = application.jobSummaryJson as ApplicationAiEnvelope | null;
  return envelope && typeof envelope === "object" ? envelope.result : undefined;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}
