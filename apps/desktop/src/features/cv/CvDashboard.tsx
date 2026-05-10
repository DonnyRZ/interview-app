import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { Application, Cv, InterviewRound, InterviewStage } from "@interview-app/shared";
import { createApplication, deleteApplication as deleteApplicationRequest, getApplications } from "../applications/application-api.js";
import { endInterview, getInterviewRounds, startInterview } from "../interviews/interview-api.js";
import { getActiveCv, getCvList, retryCvProcessing, setActiveCv, uploadCv } from "./cv-api.js";

type LoadState = "idle" | "loading" | "uploading" | "processingApplication" | "error";
type WorkspaceView = "dashboard" | "createApplication" | "applicationDetail" | "interview";
type AudioReadinessStatus = "unsupported" | "loading" | "ready" | "noDevice" | "error";
type AudioSignalStatus = "untested" | "checking" | "ok" | "silent" | "error";
type SystemAudioProbeStatus = "unsupported" | "missing" | "idle" | "checking" | "ok" | "silent" | "error" | "stopped";

type OverlayEndPayload = {
  interviewRoundId?: string;
  applicationId?: string;
  transcriptText?: string;
};

const DEV_TRANSCRIPT_SAMPLES = [
  "Bagaimana kamu memilih pendekatan yang paling cocok untuk problem utama di role ini?",
  "Kalau data atau requirement penting belum lengkap, approach kamu apa sebelum membuat keputusan?",
  "Bisa jelaskan konsep teknis dasar yang relevan dengan pekerjaan ini memakai contoh dari pengalamanmu?",
  "Coba jelaskan proses kerja yang paling penting untuk menghasilkan impact di role ini."
] as const;

const AUDIO_DEVICE_STORAGE_KEY = "interview-app:selected-audio-input-id";
const SYSTEM_AUDIO_DEVICE_KEYWORDS = [
  "stereo mix",
  "what u hear",
  "loopback",
  "virtual cable",
  "vb-audio",
  "cable output",
  "monitor of"
];

export function CvDashboard() {
  const [activeCv, setActiveCvState] = useState<Cv | null>(null);
  const [cvs, setCvs] = useState<Cv[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null);
  const [interviewRounds, setInterviewRounds] = useState<InterviewRound[]>([]);
  const [activeInterviewRound, setActiveInterviewRound] = useState<InterviewRound | null>(null);
  const [selectedStage, setSelectedStage] = useState<InterviewStage>("HR");
  const [status, setStatus] = useState<LoadState>("idle");
  const [message, setMessage] = useState("Connect backend API, lalu upload CV pertama untuk mulai membuat profile context.");
  const [view, setView] = useState<WorkspaceView>("dashboard");
  const [audioDevices, setAudioDevices] = useState<InterviewAudioInputDevice[]>([]);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState("");
  const [audioStatus, setAudioStatus] = useState<AudioReadinessStatus>("loading");
  const [audioMessage, setAudioMessage] = useState("Mengecek audio input yang tersedia di device ini.");
  const [audioSignalStatus, setAudioSignalStatus] = useState<AudioSignalStatus>("untested");
  const [audioSignalLevel, setAudioSignalLevel] = useState(0);
  const [audioSignalMessage, setAudioSignalMessage] = useState("Belum dites. Klik test signal untuk memastikan audio benar-benar masuk.");
  const [systemAudioSupport, setSystemAudioSupport] = useState<SystemAudioSupport | null>(null);
  const [systemAudioStatus, setSystemAudioStatus] = useState<SystemAudioProbeStatus>("unsupported");
  const [systemAudioLevel, setSystemAudioLevel] = useState(0);
  const [systemAudioMessage, setSystemAudioMessage] = useState("System audio probe belum dicek.");
  const [devTranscriptMessage, setDevTranscriptMessage] = useState("Belum ada transcript dev yang dikirim.");
  const audioProbeCleanupRef = useRef<(() => void) | null>(null);

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
      setMessage(error instanceof Error ? error.message : "Gagal memuat CV.");
    }
  }

  useEffect(() => {
    void refreshWorkspace();
    void refreshAudioDevices();
    void refreshSystemAudioSupport();
    const unsubscribeSystemProbe = window.interviewDesktop?.onSystemAudioProbeEvent?.(handleSystemAudioProbeEvent);

    return () => {
      stopAudioProbe();
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

  async function refreshAudioDevices() {
    if (!window.interviewDesktop?.listAudioInputDevices) {
      setAudioDevices([]);
      setSelectedAudioDeviceId("");
      setAudioStatus("unsupported");
      setAudioMessage("Audio discovery hanya tersedia di Electron desktop.");
      resetAudioSignal("Audio signal hanya bisa dites di Electron desktop.");
      return;
    }

    setAudioStatus("loading");
    setAudioMessage("Mengecek audio input yang tersedia di device ini.");

    try {
      const devices = await window.interviewDesktop.listAudioInputDevices();
      setAudioDevices(devices);

      if (!devices.length) {
        setSelectedAudioDeviceId("");
        setAudioStatus("noDevice");
        setAudioMessage("Belum ada audio input terdeteksi. Hubungkan mic/headset atau cek Windows sound settings.");
        resetAudioSignal("Belum ada audio input untuk dites.");
        return;
      }

      const savedDeviceId = window.localStorage.getItem(AUDIO_DEVICE_STORAGE_KEY) || "";
      const nextDevice = devices.find((device) => device.deviceId === savedDeviceId)
        || devices.find((device) => device.isDefault)
        || devices[0];
      if (!nextDevice) {
        setSelectedAudioDeviceId("");
        setAudioStatus("noDevice");
        setAudioMessage("Belum ada audio input terdeteksi. Hubungkan mic/headset atau cek Windows sound settings.");
        resetAudioSignal("Belum ada audio input untuk dites.");
        return;
      }

      setSelectedAudioDeviceId(nextDevice.deviceId);
      window.localStorage.setItem(AUDIO_DEVICE_STORAGE_KEY, nextDevice.deviceId);
      setAudioStatus("ready");
      setAudioMessage("Audio source sudah dipilih untuk session ini. Capture/transcription belum aktif di tahap ini.");
      resetAudioSignal("Belum dites. Klik test signal untuk memastikan audio benar-benar masuk.");
    } catch (error) {
      setAudioDevices([]);
      setSelectedAudioDeviceId("");
      setAudioStatus("error");
      setAudioMessage(error instanceof Error ? error.message : "Gagal membaca daftar audio input.");
      resetAudioSignal("Audio signal belum bisa dites karena device discovery gagal.");
    }
  }

  function handleAudioDeviceChange(deviceId: string) {
    setSelectedAudioDeviceId(deviceId);
    if (deviceId) {
      window.localStorage.setItem(AUDIO_DEVICE_STORAGE_KEY, deviceId);
      setAudioStatus("ready");
      setAudioMessage("Audio source sudah dipilih untuk session ini. Capture/transcription belum aktif di tahap ini.");
      resetAudioSignal("Device berubah. Klik test signal untuk validasi ulang.");
      return;
    }

    window.localStorage.removeItem(AUDIO_DEVICE_STORAGE_KEY);
    setAudioStatus("noDevice");
    setAudioMessage("Pilih audio source sebelum mulai validasi listening.");
    resetAudioSignal("Pilih audio source sebelum test signal.");
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
      setSystemAudioMessage(error instanceof Error ? error.message : "Gagal mengecek WASAPI loopback support.");
    }
  }

  async function startSystemAudioProbe() {
    if (!window.interviewDesktop?.startSystemAudioProbe) {
      setSystemAudioStatus("unsupported");
      setSystemAudioMessage("System audio probe hanya tersedia di Electron desktop.");
      return;
    }

    setSystemAudioStatus("checking");
    setSystemAudioLevel(0);
    setSystemAudioMessage("Menjalankan WASAPI loopback probe pada active system output...");

    try {
      const response = await window.interviewDesktop.startSystemAudioProbe();
      if (!response.ok) {
        setSystemAudioStatus("error");
        setSystemAudioLevel(0);
        setSystemAudioMessage(response.message || "Gagal memulai WASAPI loopback probe.");
      }
    } catch (error) {
      setSystemAudioStatus("error");
      setSystemAudioLevel(0);
      setSystemAudioMessage(error instanceof Error ? error.message : "Gagal memulai WASAPI loopback probe.");
    }
  }

  async function stopSystemAudioProbe() {
    await window.interviewDesktop?.stopSystemAudioProbe?.();
  }

  function handleSystemAudioProbeEvent(event: SystemAudioProbeEvent) {
    const nextLevel = Number.isFinite(event.level) ? Math.max(0, Math.min(1, event.level)) : 0;
    const deviceSuffix = event.deviceLabel ? ` (${event.deviceLabel})` : "";
    setSystemAudioLevel(nextLevel);
    setSystemAudioMessage(`${event.message || "System audio probe update."}${deviceSuffix}`);

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

  function resetAudioSignal(nextMessage: string) {
    stopAudioProbe();
    setAudioSignalStatus("untested");
    setAudioSignalLevel(0);
    setAudioSignalMessage(nextMessage);
  }

  function stopAudioProbe() {
    audioProbeCleanupRef.current?.();
    audioProbeCleanupRef.current = null;
  }

  async function validateSelectedAudioSignal() {
    if (!selectedAudioDeviceId) {
      setAudioSignalStatus("error");
      setAudioSignalLevel(0);
      setAudioSignalMessage("Pilih audio source sebelum test signal.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setAudioSignalStatus("error");
      setAudioSignalLevel(0);
      setAudioSignalMessage("Browser/Electron runtime belum mendukung getUserMedia.");
      return;
    }

    stopAudioProbe();
    setAudioSignalStatus("checking");
    setAudioSignalLevel(0);
    setAudioSignalMessage("Membuka stream lokal sebentar untuk membaca level audio...");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedAudioDeviceId === "default" ? true : { deviceId: { exact: selectedAudioDeviceId } },
        video: false
      });
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);

      const data = new Uint8Array(analyser.fftSize);
      let peakLevel = 0;
      let stopped = false;

      const cleanup = () => {
        if (stopped) return;
        stopped = true;
        stream.getTracks().forEach((track) => track.stop());
        void audioContext.close();
      };
      audioProbeCleanupRef.current = cleanup;

      const startedAt = performance.now();
      const sample = () => {
        if (stopped) return;

        analyser.getByteTimeDomainData(data);
        let total = 0;
        for (const value of data) {
          const normalized = (value - 128) / 128;
          total += normalized * normalized;
        }

        const rms = Math.sqrt(total / data.length);
        peakLevel = Math.max(peakLevel, rms);
        setAudioSignalLevel(Math.min(1, rms * 8));

        if (performance.now() - startedAt < 1800) {
          window.requestAnimationFrame(sample);
          return;
        }

        cleanup();
        audioProbeCleanupRef.current = null;
        if (peakLevel > 0.015) {
          setAudioSignalStatus("ok");
          setAudioSignalLevel(Math.min(1, peakLevel * 8));
          setAudioSignalMessage("Audio signal terdeteksi. Device ini valid untuk tahap listening berikutnya.");
        } else {
          setAudioSignalStatus("silent");
          setAudioSignalLevel(0);
          setAudioSignalMessage("Stream berhasil dibuka, tapi belum ada sinyal audio yang terdeteksi.");
        }
      };

      sample();
    } catch (error) {
      stopAudioProbe();
      setAudioSignalStatus("error");
      setAudioSignalLevel(0);
      setAudioSignalMessage(error instanceof Error ? error.message : "Gagal membuka stream audio dari device terpilih.");
    }
  }

  async function refreshApplications() {
    try {
      const response = await getApplications();
      setApplications(response.applications);
      setSelectedApplication((current) => current ? response.applications.find((item) => item.id === current.id) || null : null);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Gagal memuat applications.");
    }
  }

  async function refreshInterviewRounds(applicationId: string) {
    try {
      const response = await getInterviewRounds(applicationId);
      setInterviewRounds(response.interviewRounds);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Gagal memuat interview rounds.");
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
    setMessage(`Uploading ${file.name}...`);

    try {
      const response = await uploadCv(file);
      setActiveCvState(response.cv);
      await refreshCvs();
      setMessage(`${response.cv.fileName} berhasil diupload. AI sedang memproses CV sebelum bisa dipakai membuat application.`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Upload CV gagal.");
    }
  }

  async function handleSetActive(cvId: string) {
    setStatus("loading");
    try {
      const response = await setActiveCv(cvId);
      await refreshCvs();
      setMessage(`${response.cv.fileName} sekarang menjadi CV aktif.`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Gagal mengganti CV aktif.");
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
      setMessage(error instanceof Error ? error.message : "Gagal retry AI processing CV.");
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
      setMessage("Company dan role wajib diisi.");
      return;
    }

    if (!isCvReady(activeCv)) {
      setStatus("error");
      setMessage("Tunggu CV aktif selesai diproses AI sebelum membuat application.");
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
      setMessage(error instanceof Error ? error.message : "Gagal membuat application.");
    }
  }

  async function handleDeleteApplication(application: Application) {
    const companyRole = `${application.companyName} - ${application.roleTitle}`;
    const confirmed = window.confirm(`Hapus application "${companyRole}" beserta semua interview round di dalamnya?`);
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
      setMessage(error instanceof Error ? error.message : "Gagal menghapus application.");
    }
  }

  async function handleStartInterview(application: Application) {
    setStatus("loading");
    try {
      const response = await startInterview({
        applicationId: application.id,
        stageType: selectedStage
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
            stageType: selectedStage,
            audioStatus: hasSystemAudio ? "ready" : audioSignalStatus === "ok" ? "ready" : audioSignalStatus,
            audioDeviceLabel: hasSystemAudio ? "Active system output (WASAPI loopback)" : getSelectedAudioDeviceLabel(audioDevices, selectedAudioDeviceId),
            audioSourceKind: hasSystemAudio ? "system-loopback" : getAudioSourceKind(audioDevices, selectedAudioDeviceId),
            domainLabel: response.realtimeContext?.domainProfile.primaryDomain || getDomainProfile(application).primaryDomain,
            realtimeContext: response.realtimeContext
          });
        } catch (overlayError) {
          await endInterview(response.interviewRound.id, {
            transcriptText: "Interview otomatis ditutup karena floating overlay gagal dibuka."
          });
          await refreshInterviewRounds(application.id);
          setStatus("error");
          setMessage(overlayError instanceof Error ? overlayError.message : "Floating overlay gagal dibuka. Interview round sudah ditutup otomatis.");
          return;
        }
        await refreshInterviewRounds(application.id);
        setStatus("idle");
        setMessage(`${selectedStage} interview round started. Floating overlay aktif.`);
      } else if (window.interviewDesktop) {
        await endInterview(response.interviewRound.id, {
          transcriptText: "Interview otomatis ditutup karena Electron overlay bridge belum tersedia."
        });
        await refreshInterviewRounds(application.id);
        setStatus("error");
        setMessage("Electron overlay bridge belum tersedia. Restart dev:desktop supaya preload/main Electron terbaru aktif.");
      } else {
        await refreshInterviewRounds(application.id);
        setView("interview");
        setStatus("idle");
        setMessage(`${selectedStage} interview round started. Browser fallback aktif.`);
      }
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Gagal start interview.");
    }
  }

  async function handleOverlayInterviewEnded(payload: OverlayEndPayload) {
    if (!payload.interviewRoundId) {
      setMessage("Overlay ditutup, tapi interview round id tidak ditemukan.");
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
      setMessage("Interview ended. Transcript terbaru sudah tersimpan di round.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Gagal end interview.");
    }
  }

  useEffect(() => {
    if (selectedApplication) {
      void refreshInterviewRounds(selectedApplication.id);
    } else {
      setInterviewRounds([]);
    }
  }, [selectedApplication?.id]);

  async function pushDevTranscriptSegment(transcriptText: string) {
    const normalized = transcriptText.trim();
    if (!normalized) {
      setDevTranscriptMessage("Transcript dev kosong.");
      return;
    }

    if (!activeInterviewRound || activeInterviewRound.endedAt) {
      setDevTranscriptMessage("Belum ada interview aktif untuk menerima transcript dev.");
      return;
    }

    if (!window.interviewDesktop?.pushOverlayTranscript) {
      setDevTranscriptMessage("Bridge transcript dev belum tersedia. Restart dev:desktop.");
      return;
    }

    try {
      await window.interviewDesktop.pushOverlayTranscript({
        transcriptText: normalized,
        detectedQuestion: looksLikeQuestionText(normalized) ? normalized : undefined,
        speaker: "interviewer",
        isFinal: true,
        capturedAt: new Date().toISOString()
      });
      setDevTranscriptMessage(`Transcript dev terkirim: ${normalized}`);
    } catch (error) {
      setDevTranscriptMessage(error instanceof Error ? error.message : "Gagal mengirim transcript dev.");
    }
  }

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
          activeInterviewRound={activeInterviewRound}
          interviewRounds={interviewRounds}
          selectedStage={selectedStage}
          onBack={() => setView("dashboard")}
          onDelete={() => void handleDeleteApplication(selectedApplication)}
          onStageChange={setSelectedStage}
          onStartInterview={() => void handleStartInterview(selectedApplication)}
          onPushDevTranscript={(transcriptText) => void pushDevTranscriptSegment(transcriptText)}
          devTranscriptMessage={devTranscriptMessage}
          audioDevices={audioDevices}
          selectedAudioDeviceId={selectedAudioDeviceId}
          audioStatus={audioStatus}
          audioMessage={audioMessage}
          audioSignalStatus={audioSignalStatus}
          audioSignalLevel={audioSignalLevel}
          audioSignalMessage={audioSignalMessage}
          systemAudioSupport={systemAudioSupport}
          systemAudioStatus={systemAudioStatus}
          systemAudioLevel={systemAudioLevel}
          systemAudioMessage={systemAudioMessage}
          onAudioDeviceChange={handleAudioDeviceChange}
          onTestAudioSignal={() => void validateSelectedAudioSignal()}
          onStartSystemAudioProbe={() => void startSystemAudioProbe()}
          onStopSystemAudioProbe={() => void stopSystemAudioProbe()}
          onRefreshSystemAudioSupport={() => void refreshSystemAudioSupport()}
          onRefreshAudioDevices={() => void refreshAudioDevices()}
          isLoading={status === "loading"}
        />
      </Shell>
    );
  }

  return (
    <Shell activeCv={activeCv}>
      <section className="section-head">
        <div>
          <h1>Applications</h1>
          <p className="subcopy">Buat context per company dan role, lalu mulai interview round dari application yang sama.</p>
        </div>
        <button className="primary-btn" onClick={() => setView("createApplication")} disabled={!isCvReady(activeCv)}>
          + New Application
        </button>
      </section>

      <section className="grid two">
        <div className="panel">
          <div className="application-list no-margin">
            {applications.length ? applications.map((application) => (
              <div className="application-row" key={application.id}>
                <button
                  className="application-row-main"
                  onClick={() => selectApplication(application)}
                >
                  <div>
                    <h3>{application.companyName} - {application.roleTitle}</h3>
                    <div className="meta-line">
                      <span>CV linked</span>
                      <span>Context ready</span>
                      <span>{interviewRounds.length || 0} interview round</span>
                    </div>
                  </div>
                  <span className="pill good">Application</span>
                </button>
                <button
                  className="secondary-btn small danger-btn"
                  onClick={() => void handleDeleteApplication(application)}
                  disabled={status === "loading" || status === "processingApplication" || status === "uploading"}
                >
                  Delete
                </button>
              </div>
            )) : (
              <div className="empty-applications">
                <div className="eyebrow">Application workspace</div>
                <h2>Belum ada application</h2>
                <p className="subcopy">Upload CV dulu, lalu buat application pertama dengan company, role, dan job description.</p>
              </div>
            )}
          </div>
        </div>

        <ProfileContextPanel
          activeCv={activeCv}
          cvs={cvs}
          status={status}
          message={message}
          onRefresh={() => void refreshCvs()}
          onUpload={handleUpload}
          onSetActive={(cvId) => void handleSetActive(cvId)}
          onRetryProcessing={(cvId) => void handleRetryCvProcessing(cvId)}
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
          <div className="brand-mark">I</div>
          <div>
            <strong>Interview Assistant</strong>
            <p className="subcopy topbar-copy">MVP workspace</p>
          </div>
        </div>
        <div className="profile-pill">
          <span>CV aktif: {activeCv?.fileName || "Belum ada"}</span>
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
          <h1>Create Application</h1>
          <p className="subcopy">Application menyimpan company, role, JD, CV aktif, dan domain/niche profile untuk semua interview round berikutnya.</p>
        </div>
        <button className="secondary-btn" onClick={onCancel}>Back</button>
      </section>

      <section className="grid two">
        <form className="panel field-stack" onSubmit={onSubmit}>
          {!cvReady ? (
            <AiStatusCard
              title="CV belum siap"
              status={activeCv?.processingStatus || "failed"}
              message="Tunggu AI processing CV selesai sebelum membuat application baru."
            />
          ) : null}
              <label className="field">
                <span>Company</span>
            <input name="companyName" placeholder="Tokopedia" defaultValue="Tokopedia" />
              </label>
              <label className="field">
                <span>Role</span>
            <input name="roleTitle" placeholder="Marketing Associate" defaultValue="Marketing Associate" />
              </label>
              <label className="field">
                <span>Job Description</span>
            <textarea name="jobDescription" placeholder="Paste job description di sini..." />
              </label>
              <div className="summary-item">
                <p className="summary-label">Active CV</p>
                <strong>{activeCv?.fileName || "Belum ada active CV"}</strong>
                <p className="subcopy compact">Application akan memakai CV aktif saat ini.</p>
              </div>
          {activeCv ? <CvProcessingStatus cv={activeCv} compact /> : null}
          <button className="primary-btn" type="submit" disabled={!cvReady || isLoading}>
                {isLoading ? "Analyzing JD..." : "Save Application"}
              </button>
            </form>

        <aside className="panel">
          <h2>AI Processing</h2>
          <p className="subcopy">Saat disimpan, backend akan membuat JD summary, domain/niche boundary, dan interview prep context dari CV aktif + JD.</p>
          {isLoading ? (
            <AiStatusCard
              title="Analyzing domain context"
              status="processing"
              message="AI sedang membuat JD summary, niche boundary, dan preparation themes."
            />
          ) : null}
          <div className="keywords">
            <span className="pill">Domain profile</span>
            <span className="pill">Niche boundary</span>
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
  onRefresh,
  onUpload,
  onSetActive,
  onRetryProcessing
}: {
  activeCv: Cv | null;
  cvs: Cv[];
  status: LoadState;
  message: string;
  onRefresh: () => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onSetActive: (cvId: string) => void;
  onRetryProcessing: (cvId: string) => void;
}) {
  return (
    <aside className="panel profile-panel">
      <h2>Profile Context</h2>
      <p className="subcopy">CV diproses sekali di profile level dan dipakai ulang untuk semua application.</p>

      <div className="summary-box">
            <div className="summary-item">
              <p className="summary-label">Active CV</p>
              {activeCv ? (
                <>
                  <strong>{activeCv.fileName}</strong>
                  <p className="subcopy compact">Uploaded {formatDate(activeCv.createdAt)}</p>
                </>
              ) : (
                <p className="subcopy compact">Belum ada CV aktif.</p>
              )}
            </div>

        {activeCv ? (
          <CvProcessingStatus cv={activeCv} onRetry={() => onRetryProcessing(activeCv.id)} />
        ) : null}

        <div className="summary-item">
          <p className="summary-label">Candidate summary</p>
          <p className="subcopy compact">{activeCv ? getCandidateSummary(activeCv) : "Upload CV untuk membuat candidate summary."}</p>
        </div>

            <label className="upload-box">
              <strong>Upload CV</strong>
          <input type="file" accept=".pdf,.doc,.docx" onChange={onUpload} disabled={status === "uploading"} />
              <p className="subcopy compact">PDF, DOC, atau DOCX. File terbaru otomatis menjadi active CV, lalu diproses AI sebelum bisa dipakai.</p>
            </label>

        {cvs.length > 1 ? (
          <details className="summary-item">
            <summary>CV Version History</summary>
            <div className="cv-list">
              {cvs.map((cv) => (
                  <div className="cv-row" key={cv.id}>
                    <div>
                      <strong>{cv.fileName}</strong>
                      <p>{formatDate(cv.createdAt)}</p>
                    </div>
                    {cv.isActive ? (
                      <span className={`pill ${cv.processingStatus === "ready" ? "good" : cv.processingStatus === "failed" ? "danger" : "warn"}`}>
                        {cv.processingStatus === "ready" ? "Active" : cv.processingStatus}
                      </span>
                    ) : (
                    <button className="secondary-btn small" onClick={() => onSetActive(cv.id)}>
                        Set active
                      </button>
                    )}
                  </div>
              ))}
              </div>
          </details>
        ) : null}

        <div className={`status-card slim ${status === "error" ? "error" : ""}`}>
          <strong>{status === "uploading" ? "Uploading CV" : status === "loading" ? "Syncing" : "Status"}</strong>
          <p>{message}</p>
        </div>
      </div>
      <button className="secondary-btn" onClick={onRefresh} disabled={status === "loading" || status === "uploading"}>Refresh</button>
    </aside>
  );
}

function ApplicationDetailView({
  application,
  activeInterviewRound,
  interviewRounds,
  selectedStage,
  onBack,
  onDelete,
  onStageChange,
  onStartInterview,
  onPushDevTranscript,
  devTranscriptMessage,
  audioDevices,
  selectedAudioDeviceId,
  audioStatus,
  audioMessage,
  audioSignalStatus,
  audioSignalLevel,
  audioSignalMessage,
  systemAudioSupport,
  systemAudioStatus,
  systemAudioLevel,
  systemAudioMessage,
  onAudioDeviceChange,
  onTestAudioSignal,
  onStartSystemAudioProbe,
  onStopSystemAudioProbe,
  onRefreshSystemAudioSupport,
  onRefreshAudioDevices,
  isLoading
}: {
  application: Application;
  activeInterviewRound: InterviewRound | null;
  interviewRounds: InterviewRound[];
  selectedStage: InterviewStage;
  onBack: () => void;
  onDelete: () => void;
  onStageChange: (stage: InterviewStage) => void;
  onStartInterview: () => void;
  onPushDevTranscript: (transcriptText: string) => void;
  devTranscriptMessage: string;
  audioDevices: InterviewAudioInputDevice[];
  selectedAudioDeviceId: string;
  audioStatus: AudioReadinessStatus;
  audioMessage: string;
  audioSignalStatus: AudioSignalStatus;
  audioSignalLevel: number;
  audioSignalMessage: string;
  systemAudioSupport: SystemAudioSupport | null;
  systemAudioStatus: SystemAudioProbeStatus;
  systemAudioLevel: number;
  systemAudioMessage: string;
  onAudioDeviceChange: (deviceId: string) => void;
  onTestAudioSignal: () => void;
  onStartSystemAudioProbe: () => void;
  onStopSystemAudioProbe: () => void;
  onRefreshSystemAudioSupport: () => void;
  onRefreshAudioDevices: () => void;
  isLoading: boolean;
}) {
  const domainProfile = getDomainProfile(application);
  const prepThemes = getInterviewPrepThemes(application);
  const hasLiveDevHarness = Boolean(activeInterviewRound && !activeInterviewRound.endedAt && window.interviewDesktop?.pushOverlayTranscript);

  return (
    <>
      <section className="section-head">
        <div>
          <h1>{application.companyName}</h1>
          <p className="subcopy">{application.roleTitle} - CV aktif tersambung</p>
        </div>
        <div className="actions-row no-margin">
          <button className="secondary-btn" onClick={onBack}>Back to Dashboard</button>
          <button className="secondary-btn danger-btn" onClick={onDelete}>Delete Application</button>
        </div>
      </section>

      <section className="grid two">
        <div className="panel">
          <h2>Application Context</h2>
          <div className="summary-box detail-grid">
        <div className="summary-item">
          <p className="summary-label">JD Summary</p>
          <p>{getJdSummary(application)}</p>
        </div>
            <div className="summary-item">
              <p className="summary-label">Domain / Niche Profile</p>
              <strong>{domainProfile.primaryDomain || "Domain belum cukup jelas"}</strong>
              <p className="subcopy compact">{domainProfile.nicheDescription || "AI belum punya cukup konteks untuk menentukan niche yang tajam."}</p>
              {domainProfile.seedConcepts.length ? (
                <>
                  <p className="summary-label compact">Niche Signals</p>
                  <div className="keywords">
                    {domainProfile.seedConcepts.slice(0, 5).map((concept) => (
                      <span className="pill" key={concept}>{concept}</span>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
            <div className="summary-item">
              <p className="summary-label">Interview Prep Themes</p>
              <ul className="theme-list">
                {prepThemes.map((theme) => (
                  <li key={theme}>{theme}</li>
                ))}
              </ul>
            </div>
            <details className="summary-item">
              <summary>AI Context Details</summary>
              {domainProfile.relevanceGuidance ? (
                <div className="detail-block">
                  <p className="summary-label">Relevance Guidance</p>
                  <p className="clamped-copy">{domainProfile.relevanceGuidance}</p>
                </div>
              ) : null}
              {domainProfile.inScopeConcepts.length ? (
                <div className="detail-block">
                  <p className="summary-label">In Scope Concepts</p>
                  <div className="keywords compact-list">
                    {domainProfile.inScopeConcepts.slice(0, 8).map((concept) => (
                      <span className="pill" key={concept}>{concept}</span>
                    ))}
                  </div>
                </div>
              ) : null}
              {domainProfile.outOfScopeConcepts.length ? (
                <div className="detail-block">
                  <p className="summary-label">Out of Scope Examples</p>
                  <div className="keywords compact-list">
                    {domainProfile.outOfScopeConcepts.slice(0, 5).map((concept) => (
                      <span className="pill warn" key={concept}>{concept}</span>
                    ))}
                  </div>
                </div>
              ) : null}
            </details>
        <div className="summary-item">
              <p className="summary-label">Previous Rounds</p>
              <div className="round-list">
                {interviewRounds.length ? interviewRounds.map((round) => (
                  <div className="round-row" key={round.id}>
                    <strong>{round.stageType}</strong>
                    <span>{round.endedAt ? "Ended" : "Started"} - {formatDate(round.startedAt)}</span>
                  </div>
                )) : (
                  <p className="subcopy compact">Belum ada interview round.</p>
                )}
              </div>
            </div>
            <details className="summary-item">
              <summary>Job Description</summary>
          <p>{application.jobDescription || "Belum ada job description."}</p>
            </details>
          </div>
        </div>

        <aside className="panel">
          <h2>Start New Interview Round</h2>
          <p className="subcopy">Pilih stage sebelum session live dimulai.</p>
          <AudioReadinessCard
            devices={audioDevices}
            selectedDeviceId={selectedAudioDeviceId}
            status={audioStatus}
            message={audioMessage}
            signalStatus={audioSignalStatus}
            signalLevel={audioSignalLevel}
            signalMessage={audioSignalMessage}
            systemSupport={systemAudioSupport}
            systemStatus={systemAudioStatus}
            systemLevel={systemAudioLevel}
            systemMessage={systemAudioMessage}
            onDeviceChange={onAudioDeviceChange}
            onTestSignal={onTestAudioSignal}
            onStartSystemProbe={onStartSystemAudioProbe}
            onStopSystemProbe={onStopSystemAudioProbe}
            onRefreshSystemSupport={onRefreshSystemAudioSupport}
            onRefresh={onRefreshAudioDevices}
          />
          <div className="stage-grid">
            {stageOptions.map((stage) => (
              <button
                className={`stage-btn ${stage.value === "OTHER" ? "wide" : ""} ${selectedStage === stage.value ? "active" : ""}`}
                key={stage.value}
                onClick={() => onStageChange(stage.value)}
              >
                {stage.label}
                <span>{stage.hint}</span>
              </button>
            ))}
          </div>
          <div className="actions-row">
            <button className="primary-btn" onClick={onStartInterview} disabled={isLoading}>
              Start Interview
            </button>
            <span className="pill good">{selectedStage} selected</span>
          </div>
          {hasLiveDevHarness ? (
            <DevTranscriptHarness
              onSubmit={onPushDevTranscript}
              samples={DEV_TRANSCRIPT_SAMPLES}
              message={devTranscriptMessage}
            />
          ) : null}
        </aside>
      </section>
    </>
  );
}

function DevTranscriptHarness({
  onSubmit,
  samples,
  message
}: {
  onSubmit: (transcriptText: string) => void;
  samples: readonly string[];
  message: string;
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const transcriptText = String(formData.get("transcriptText") || "").trim();
    if (!transcriptText) {
      return;
    }
    form.reset();
    onSubmit(transcriptText);
  }

  return (
    <div className="status-card slim">
      <strong>Dev Transcript Harness</strong>
      <p>Kirim potongan ucapan interviewer ke overlay tanpa STT live dulu.</p>
      <form className="field-stack no-margin" onSubmit={handleSubmit}>
        <label className="field">
          <span>Transcript segment</span>
          <textarea name="transcriptText" placeholder="Contoh: Bagaimana kamu memvalidasi solusi untuk problem utama di role ini?" rows={3} />
        </label>
        <div className="actions-row no-margin">
          <button className="secondary-btn small" type="submit">Push transcript</button>
        </div>
      </form>
      <div className="keywords">
        {samples.map((sample) => (
          <button className="secondary-btn small" key={sample} onClick={() => onSubmit(sample)}>
            Sample
          </button>
        ))}
      </div>
      <p className="subcopy compact">{message}</p>
    </div>
  );
}

function AudioReadinessCard({
  devices,
  selectedDeviceId,
  status,
  message,
  signalStatus,
  signalLevel,
  signalMessage,
  systemSupport,
  systemStatus,
  systemLevel,
  systemMessage,
  onDeviceChange,
  onTestSignal,
  onStartSystemProbe,
  onStopSystemProbe,
  onRefreshSystemSupport,
  onRefresh
}: {
  devices: InterviewAudioInputDevice[];
  selectedDeviceId: string;
  status: AudioReadinessStatus;
  message: string;
  signalStatus: AudioSignalStatus;
  signalLevel: number;
  signalMessage: string;
  systemSupport: SystemAudioSupport | null;
  systemStatus: SystemAudioProbeStatus;
  systemLevel: number;
  systemMessage: string;
  onDeviceChange: (deviceId: string) => void;
  onTestSignal: () => void;
  onStartSystemProbe: () => void;
  onStopSystemProbe: () => void;
  onRefreshSystemSupport: () => void;
  onRefresh: () => void;
}) {
  const selectedDevice = getSelectedAudioDevice(devices, selectedDeviceId);
  const isSystemCandidateSelected = selectedDevice ? isLikelySystemAudioDevice(selectedDevice) : false;
  const systemCandidates = devices.filter(isLikelySystemAudioDevice);

  return (
    <div className="audio-readiness">
      <div className="status-title-row">
        <p className="summary-label">Audio Readiness</p>
        <span className={`pill ${status === "ready" ? "good" : status === "error" ? "danger" : "warn"}`}>
          {getAudioStatusLabel(status)}
        </span>
      </div>
      <label className="field audio-field">
        <span>Runtime audio source</span>
        <select
          className="audio-select"
          value={selectedDeviceId}
          onChange={(event) => onDeviceChange(event.currentTarget.value)}
          disabled={status === "unsupported" || status === "loading" || !devices.length}
        >
          {!devices.length ? <option value="">No audio input detected</option> : null}
          {devices.map((device) => (
            <option key={`${device.deviceId}-${device.label}`} value={device.deviceId}>
              [{getAudioSourceTypeLabel(device)}] {device.label}{device.isDefault ? " (default)" : ""}
            </option>
          ))}
        </select>
      </label>
      <p className="subcopy compact">{message}</p>
      <div className="audio-source-types">
        <div className={`audio-source-card ${selectedDevice && !isSystemCandidateSelected ? "active" : ""}`}>
          <div className="status-title-row">
            <strong>Microphone input</strong>
            <span className={`pill ${selectedDevice && !isSystemCandidateSelected ? "good" : "warn"}`}>
              {selectedDevice && !isSystemCandidateSelected ? "selected" : "not selected"}
            </span>
          </div>
          <p className="subcopy compact">Valid untuk mic user. Ini tidak membuktikan meeting/browser system audio masuk langsung.</p>
        </div>
        <div className={`audio-source-card ${isSystemCandidateSelected ? "active" : ""}`}>
          <div className="status-title-row">
            <strong>System/meeting audio</strong>
            <span className={`pill ${isSystemCandidateSelected ? "good" : systemCandidates.length ? "warn" : "danger"}`}>
              {isSystemCandidateSelected ? "selected" : systemCandidates.length ? "candidate found" : "not configured"}
            </span>
          </div>
          <p className="subcopy compact">
            Butuh Stereo Mix, virtual cable, atau native WASAPI loopback. Candidate terdeteksi: {systemCandidates.length}.
          </p>
        </div>
      </div>
      <div className="audio-meter system">
        <div className="status-title-row">
          <span className="summary-label">System audio probe</span>
          <span className={`pill ${systemStatus === "ok" ? "good" : systemStatus === "error" || systemStatus === "missing" ? "danger" : "warn"}`}>
            {getSystemAudioStatusLabel(systemStatus)}
          </span>
        </div>
        <div className="audio-meter-track" aria-hidden="true">
          <div className={`audio-meter-fill ${systemStatus}`} style={{ width: `${Math.round(systemLevel * 100)}%` }} />
        </div>
        <p className="subcopy compact">{systemMessage}</p>
        {systemSupport?.helperPath ? (
          <p className="subcopy compact">Helper: {systemSupport.helperExists ? "available" : "missing"}</p>
        ) : null}
        <div className="actions-row no-margin">
          <button
            className="secondary-btn small"
            onClick={onStartSystemProbe}
            disabled={systemStatus === "checking" || systemStatus === "unsupported" || systemStatus === "missing"}
          >
            {systemStatus === "checking" ? "Probing..." : "Probe system audio"}
          </button>
          <button className="secondary-btn small" onClick={onStopSystemProbe} disabled={systemStatus !== "checking"}>
            Stop
          </button>
          <button className="secondary-btn small" onClick={onRefreshSystemSupport} disabled={systemStatus === "checking"}>
            Recheck
          </button>
        </div>
      </div>
      <div className="audio-meter">
        <div className="status-title-row">
          <span className="summary-label">Signal validation</span>
          <span className={`pill ${signalStatus === "ok" ? "good" : signalStatus === "error" ? "danger" : "warn"}`}>
            {getAudioSignalStatusLabel(signalStatus)}
          </span>
        </div>
        <div className="audio-meter-track" aria-hidden="true">
          <div className={`audio-meter-fill ${signalStatus}`} style={{ width: `${Math.round(signalLevel * 100)}%` }} />
        </div>
        <p className="subcopy compact">{signalMessage}</p>
      </div>
      <div className="actions-row no-margin">
        <button className="secondary-btn small" onClick={onTestSignal} disabled={status !== "ready" || signalStatus === "checking"}>
          {signalStatus === "checking" ? "Testing..." : "Test signal"}
        </button>
        <button className="secondary-btn small" onClick={onRefresh} disabled={status === "loading" || signalStatus === "checking"}>
          Refresh devices
        </button>
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
          <span>Interview Session</span>
          <button className="secondary-btn small" onClick={onBack}>Back</button>
        </div>
        <div className="zoom-dummy-body">
          <div>
            <p className="eyebrow">Meeting placeholder</p>
            <h1>{interviewRound.stageType} Round Started</h1>
            <p className="subcopy">{application.companyName} - {application.roleTitle}</p>
          </div>
          <div className="summary-box">
        <div className="summary-item">
              <p className="summary-label">Status</p>
              <p>Browser fallback only. Di Electron, Start Interview seharusnya membuka floating overlay window terpisah.</p>
        </div>
        <div className="summary-item">
              <p className="summary-label">Started At</p>
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
          Retry AI Processing
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
        <p className="subcopy compact">New Application dikunci sampai CV status menjadi ready.</p>
      ) : null}
      {action ? <div className="actions-row no-margin">{action}</div> : null}
    </div>
  );
}

const stageOptions: Array<{ value: InterviewStage; label: string; hint: string }> = [
  { value: "HR", label: "HR", hint: "culture" },
  { value: "TECHNICAL", label: "Technical", hint: "skill" },
  { value: "USER", label: "User", hint: "workflow" },
  { value: "FINAL", label: "Final", hint: "closing" },
  { value: "OTHER", label: "Other", hint: "custom" }
];

function getDomainProfile(application: Application): DomainProfile {
  const result = getApplicationAiResult(application);
  if (result?.domainProfile) {
    return normalizeDomainProfile(result.domainProfile);
  }

  if (result?.domainKeywords?.length) {
    return normalizeDomainProfile({
      primaryDomain: application.roleTitle,
      nicheDescription: "Application ini memakai format AI lama. Seed concepts berikut hanya referensi sementara, bukan runtime keyword chips.",
      seedConcepts: result.domainKeywords,
      inScopeConcepts: result.domainKeywords,
      outOfScopeConcepts: [],
      relevanceGuidance: "Buat ulang application untuk mendapatkan niche boundary versi terbaru."
    });
  }

  return normalizeDomainProfile({
    primaryDomain: application.roleTitle,
    nicheDescription: application.jobDescription
      ? "Domain profile belum tersedia. Buat ulang application agar AI membangun niche boundary yang lebih tepat."
      : "Domain profile belum tersedia karena job description kosong.",
    seedConcepts: [],
    inScopeConcepts: [],
    outOfScopeConcepts: [],
    relevanceGuidance: "Runtime keyword hanya boleh muncul setelah transcript live terbukti relevan dengan niche application."
  });
}

function getInterviewPrepThemes(application: Application) {
  const result = getApplicationAiResult(application);
  const themes = result?.interviewPrepThemes || result?.likelyInterviewThemes;
  return themes?.length ? compactTextList(themes, 3, 90) : ["Validasi scope role", "Hubungkan pengalaman CV dengan kebutuhan JD"];
}

function getJdSummary(application: Application) {
  return getApplicationAiResult(application)?.jdSummary || application.companyContext || "Application context belum tersedia.";
}

function getCandidateSummary(cv: Cv) {
  if (cv.processingStatus === "processing") {
    return "AI sedang membaca CV dan membuat candidate summary.";
  }
  if (cv.processingStatus === "failed") {
    return "Candidate summary belum tersedia karena AI processing gagal.";
  }
  return getCvAiResult(cv)?.candidateSummary || cv.readyContext || "Candidate summary belum tersedia.";
}

function isCvReady(cv: Cv | null) {
  return cv?.processingStatus === "ready";
}

function getCvStatusMessage(cv: Cv | null) {
  if (!cv) return "Belum ada CV aktif. Upload CV untuk memulai.";
  if (cv.processingStatus === "processing") return `${cv.fileName} sedang diproses AI. Tunggu sampai ready sebelum membuat application.`;
  if (cv.processingStatus === "failed") return `${cv.fileName} gagal diproses AI. Klik retry sebelum membuat application.`;
  return "CV aktif sudah diproses AI dan siap dipakai untuk application berikutnya.";
}

function getCvProcessingTitle(cv: Cv) {
  if (cv.processingStatus === "processing") return "AI Processing";
  if (cv.processingStatus === "failed") return "AI Failed";
  if (cv.processingStatus === "uploaded") return "Uploaded";
  return "AI Ready";
}

function getCvProcessingDetail(cv: Cv) {
  if (cv.processingStatus === "processing") {
    return "AI sedang membaca CV, mengekstrak skill, pengalaman, dan interview-ready context.";
  }
  if (cv.processingStatus === "failed") {
    return cv.processingError || "AI gagal memproses CV. Retry sebelum membuat application.";
  }
  if (cv.processingStatus === "uploaded") {
    return "CV sudah diupload dan menunggu AI processing.";
  }
  return "CV sudah diproses AI dan siap dipakai untuk application.";
}

function getAudioStatusLabel(status: AudioReadinessStatus) {
  if (status === "ready") return "ready";
  if (status === "loading") return "checking";
  if (status === "unsupported") return "desktop only";
  if (status === "noDevice") return "no device";
  return "error";
}

function getAudioSignalStatusLabel(status: AudioSignalStatus) {
  if (status === "ok") return "signal OK";
  if (status === "checking") return "testing";
  if (status === "silent") return "silent";
  if (status === "error") return "error";
  return "untested";
}

function looksLikeQuestionText(text: string) {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (normalized.includes("?")) {
    return true;
  }

  return /^(apa|apakah|bagaimana|kenapa|mengapa|kapan|di mana|seberapa|jelaskan|ceritakan|how|what|why|when|where|can|could|do|did|have|tell me)\b/.test(normalized);
}

function getSystemAudioStatusLabel(status: SystemAudioProbeStatus) {
  if (status === "ok") return "system OK";
  if (status === "checking") return "probing";
  if (status === "silent") return "silent";
  if (status === "missing") return "helper missing";
  if (status === "unsupported") return "unsupported";
  if (status === "stopped") return "stopped";
  if (status === "error") return "error";
  return "ready";
}

function getSelectedAudioDeviceLabel(devices: InterviewAudioInputDevice[], selectedDeviceId: string) {
  return getSelectedAudioDevice(devices, selectedDeviceId)?.label || "Audio source belum dipilih";
}

function getSelectedAudioDevice(devices: InterviewAudioInputDevice[], selectedDeviceId: string) {
  return devices.find((device) => device.deviceId === selectedDeviceId);
}

function getAudioSourceKind(devices: InterviewAudioInputDevice[], selectedDeviceId: string) {
  const device = getSelectedAudioDevice(devices, selectedDeviceId);
  return device && isLikelySystemAudioDevice(device) ? "system-candidate" : "microphone";
}

function getAudioSourceTypeLabel(device: InterviewAudioInputDevice) {
  return isLikelySystemAudioDevice(device) ? "System candidate" : "Mic";
}

function isLikelySystemAudioDevice(device: InterviewAudioInputDevice) {
  const label = device.label.toLowerCase();
  return SYSTEM_AUDIO_DEVICE_KEYWORDS.some((keyword) => label.includes(keyword));
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
