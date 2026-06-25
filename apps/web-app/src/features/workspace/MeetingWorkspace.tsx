import type { LiveMeetingSession, ProfileDocument } from "@interview-app/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useSystemAudio } from "../audio/use-system-audio.js";
import { FloatingAudioOverlay } from "../overlay/FloatingAudioOverlay.js";
import { useFloatingOverlay } from "../overlay/use-floating-overlay.js";
import type { FloatingOverlayMode } from "../overlay/use-floating-overlay.js";
import { useRealtimeTranscription } from "../realtime/use-realtime-transcription.js";
import { deleteLiveMeetingSession, endLiveMeeting, getLiveMeetingSessions } from "../realtime/realtime-api.js";
import { MeetingContextDetail } from "./MeetingContextDetail.js";
import { MeetingContextPanel, ProfileReferencePanel } from "./WorkspacePanels.js";
import { useWorkspaceData } from "./use-workspace-data.js";
import type { WorkspaceMeetingContext } from "./workspace-model.js";

export function MeetingWorkspace() {
  const workspace = useWorkspaceData();
  const [selectedMeetingContextId, setSelectedMeetingContextId] = useState<string | null>(null);
  const [creatingContext, setCreatingContext] = useState(false);
  const [meetingStartError, setMeetingStartError] = useState("");
  const [floatingOverlayMode, setFloatingOverlayMode] = useState<FloatingOverlayMode>("mini");
  const [liveMeetingSessions, setLiveMeetingSessions] = useState<LiveMeetingSession[]>([]);
  const [sessionError, setSessionError] = useState("");
  const selectedMeetingContext = useMemo(
    () => workspace.meetingContexts.find((context) => context.id === selectedMeetingContextId) || null,
    [selectedMeetingContextId, workspace.meetingContexts]
  );
  const selectedProfile = selectedMeetingContext
    ? workspace.profileDocuments.find((profile) => profile.id === selectedMeetingContext.profileDocumentId) || workspace.activeProfile
    : workspace.activeProfile;
  const audio = useSystemAudio();
  const realtime = useRealtimeTranscription(audio);
  const handleNativeOverlayClosed = useCallback(() => {
    void realtime.stop();
  }, [realtime.stop]);
  const overlay = useFloatingOverlay(handleNativeOverlayClosed);
  const overlayActive = overlay.active;

  useEffect(() => {
    if (audio.active || !realtime.active) return;
    overlay.close();
    void realtime.stop();
  }, [audio.active, overlay.close, realtime.active, realtime.stop]);

  useEffect(() => {
    if (!selectedMeetingContextId || selectedMeetingContext || workspace.loading) return;
    setSelectedMeetingContextId(null);
  }, [selectedMeetingContext, selectedMeetingContextId, workspace.loading]);

  const refreshSessions = useCallback(async (meetingContextId: string) => {
    try {
      const response = await getLiveMeetingSessions(meetingContextId);
      setLiveMeetingSessions(response.liveMeetingSessions);
      setSessionError("");
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : "Riwayat sesi gagal dimuat.");
    }
  }, []);

  useEffect(() => {
    if (!selectedMeetingContextId) {
      setLiveMeetingSessions([]);
      return;
    }
    void refreshSessions(selectedMeetingContextId);
  }, [refreshSessions, selectedMeetingContextId]);

  async function startMeeting() {
    if (!selectedMeetingContext) return;
    setMeetingStartError("");
    setFloatingOverlayMode("mini");
    if (!overlay.supported) {
      setMeetingStartError("Floating overlay memerlukan Chrome terbaru dengan Document Picture-in-Picture.");
      return;
    }
    if (!(await realtime.start(selectedMeetingContext.id))) {
      setMeetingStartError(realtime.message || "Sesi realtime belum berhasil dimulai.");
      await refreshSessions(selectedMeetingContext.id);
      return;
    }
    if (!(await overlay.open())) {
      await realtime.stop();
      setMeetingStartError(overlay.error || "Floating overlay gagal dibuka. Sesi sudah ditutup otomatis.");
    }
  }

  function closeOverlay() {
    overlay.close();
    void realtime.stop().finally(() => {
      if (selectedMeetingContextId) void refreshSessions(selectedMeetingContextId);
    });
  }

  const handleOverlayModeChange = useCallback((mode: FloatingOverlayMode) => {
    setFloatingOverlayMode(mode);
    overlay.resize(mode);
  }, [overlay.resize]);

  function closeMeetingContext() {
    closeOverlay();
    void audio.stop();
    setSelectedMeetingContextId(null);
  }

  async function createContext(input: { contextName: string; meetingTopic: string; meetingBrief?: string }) {
    try {
      const created = await workspace.addMeetingContext(input);
      setCreatingContext(false);
      setSelectedMeetingContextId(created.id);
    } catch {
      // The workspace notice renders the API error.
    }
  }

  async function removeContext(meetingContext: WorkspaceMeetingContext) {
    const confirmed = window.confirm(`Hapus konteks meeting "${meetingContext.contextName} - ${meetingContext.meetingTopic}" beserta sesi live di dalamnya?`);
    if (!confirmed) return;
    try {
      await workspace.removeMeetingContext(meetingContext);
      if (selectedMeetingContextId === meetingContext.id) closeMeetingContext();
    } catch {
      // The workspace notice renders the API error.
    }
  }

  async function removeProfile(profile: ProfileDocument) {
    const activeNote = profile.isActive ? " Profil ready terbaru lain akan menjadi default jika tersedia." : "";
    const confirmed = window.confirm(`Hapus profil "${profile.fileName}"?${activeNote}`);
    if (!confirmed) return;
    await workspace.removeProfile(profile).catch(() => undefined);
  }

  async function selectContextProfile(profile: ProfileDocument) {
    if (!selectedMeetingContext) return;
    await workspace.selectContextProfile(selectedMeetingContext, profile).catch(() => undefined);
  }

  async function endStuckSession(session: LiveMeetingSession) {
    try {
      await endLiveMeeting(session.id, "Sesi meeting diakhiri dari web workspace karena tidak ada floating overlay aktif.");
      await refreshSessions(session.meetingContextId);
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : "Sesi gagal diakhiri.");
    }
  }

  async function removeSession(session: LiveMeetingSession) {
    if (!window.confirm("Hapus sesi ini beserta transkripnya?")) return;
    try {
      await deleteLiveMeetingSession(session.id);
      await refreshSessions(session.meetingContextId);
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : "Sesi gagal dihapus.");
    }
  }

  const floatingOverlay = (
    <FloatingAudioOverlay
      status={audio.status}
      trackLabel={audio.trackLabel}
      realtimeStatus={realtime.status}
      realtimeMessage={realtime.message}
      transcript={realtime.latestTranscript}
      contextName={selectedMeetingContext?.contextName || "Meeting"}
      meetingTopic={selectedMeetingContext?.meetingTopic || "Live session"}
      help={realtime.help}
      onModeChange={handleOverlayModeChange}
      onClose={closeOverlay}
    />
  );

  return (
    <div className="workspace-shell">
      <header className="workspace-topbar">
        <div className="brand">
          <img className="brand-logo" src={`${import.meta.env.BASE_URL}assets/orviko-logo.png`} alt="" aria-hidden="true" />
          <strong>Orviko</strong>
        </div>
        <div className="workspace-title-group"><h1>Meeting Workspace</h1></div>
        <div className="profile-pill">
          <span>Profil default: {workspace.activeProfile?.fileName || "Belum ada"}</span>
          <span className="avatar" aria-hidden="true" />
        </div>
      </header>

      <main className="workspace-columns">
        <ProfileReferencePanel
          activeProfile={workspace.activeProfile}
          profiles={workspace.profileDocuments}
          busyAction={workspace.busyAction}
          loading={workspace.loading}
          message={workspace.profileMessage}
          error={workspace.profileError}
          onUpload={(file) => void workspace.uploadProfile(file).catch(() => undefined)}
          onActivate={(profile) => void workspace.activateProfile(profile).catch(() => undefined)}
          onRetry={(profile) => void workspace.retryProfile(profile).catch(() => undefined)}
          onDelete={(profile) => void removeProfile(profile)}
        />

        {selectedMeetingContext ? (
          <MeetingContextDetail
            meetingContext={selectedMeetingContext}
            profile={selectedProfile}
            profiles={workspace.profileDocuments}
            sessions={liveMeetingSessions}
            sessionError={sessionError}
            workspaceBusy={Boolean(workspace.busyAction)}
            audio={audio}
            overlayActive={overlayActive}
            overlayError={meetingStartError || overlay.error}
            realtimeStatus={realtime.status}
            realtimeMessage={realtime.message}
            latestTranscript={realtime.latestTranscript}
            onStartMeeting={() => void startMeeting()}
            onCloseOverlay={closeOverlay}
            onSelectProfile={(profile) => void selectContextProfile(profile)}
            onEndSession={(session) => void endStuckSession(session)}
            onDeleteSession={(session) => void removeSession(session)}
            onBack={closeMeetingContext}
          />
        ) : (
          <MeetingContextPanel
            meetingContexts={workspace.meetingContexts}
            activeProfile={workspace.activeProfile}
            busyAction={workspace.busyAction}
            loading={workspace.loading}
            creating={creatingContext}
            message={workspace.contextMessage}
            error={workspace.contextError}
            onToggleCreate={() => setCreatingContext((current) => !current)}
            onCreate={(input) => void createContext(input)}
            onOpen={setSelectedMeetingContextId}
            onDelete={(meetingContext) => void removeContext(meetingContext)}
          />
        )}
      </main>
      {overlay.mountNode ? createPortal(floatingOverlay, overlay.mountNode) : null}
    </div>
  );
}
