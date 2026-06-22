import type { ProfileDocument } from "@interview-app/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useSystemAudio } from "../audio/use-system-audio.js";
import { FloatingAudioOverlay } from "../overlay/FloatingAudioOverlay.js";
import { useFloatingOverlay } from "../overlay/use-floating-overlay.js";
import type { FloatingOverlayMode } from "../overlay/use-floating-overlay.js";
import { useRealtimeTranscription } from "../realtime/use-realtime-transcription.js";
import { MeetingContextDetail } from "./MeetingContextDetail.js";
import { MeetingContextPanel, ProfileReferencePanel } from "./WorkspacePanels.js";
import { useWorkspaceData } from "./use-workspace-data.js";
import type { WorkspaceMeetingContext } from "./workspace-model.js";

export function MeetingWorkspace() {
  const workspace = useWorkspaceData();
  const [selectedMeetingContextId, setSelectedMeetingContextId] = useState<string | null>(null);
  const [creatingContext, setCreatingContext] = useState(false);
  const [fallbackOverlayOpen, setFallbackOverlayOpen] = useState(false);
  const [meetingStartError, setMeetingStartError] = useState("");
  const [floatingOverlayMode, setFloatingOverlayMode] = useState<FloatingOverlayMode>("mini");
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
  const overlayActive = overlay.active || fallbackOverlayOpen;

  useEffect(() => {
    if (audio.active || !realtime.active) return;
    overlay.close();
    setFallbackOverlayOpen(false);
    void realtime.stop();
  }, [audio.active, overlay.close, realtime.active, realtime.stop]);

  useEffect(() => {
    if (!selectedMeetingContextId || selectedMeetingContext || workspace.loading) return;
    setSelectedMeetingContextId(null);
  }, [selectedMeetingContext, selectedMeetingContextId, workspace.loading]);

  async function startMeeting() {
    if (!selectedMeetingContext) return;
    setMeetingStartError("");
    setFloatingOverlayMode("mini");
    setFallbackOverlayOpen(false);
    if (!(await realtime.start(selectedMeetingContext.id))) {
      setMeetingStartError(realtime.message || "Sesi realtime belum berhasil dimulai.");
      return;
    }
    if (!overlay.supported || !(await overlay.open())) setFallbackOverlayOpen(true);
  }

  function closeOverlay() {
    overlay.close();
    setFallbackOverlayOpen(false);
    void realtime.stop();
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

  const floatingOverlay = (
    <FloatingAudioOverlay
      status={audio.status}
      trackLabel={audio.trackLabel}
      realtimeStatus={realtime.status}
      realtimeMessage={realtime.message}
      transcript={realtime.interimTranscript || realtime.latestTranscript}
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
          <img className="brand-logo" src="/assets/orviko-logo.png" alt="" aria-hidden="true" />
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
            audio={audio}
            overlayActive={overlayActive}
            overlayError={meetingStartError || (fallbackOverlayOpen ? overlay.error : "")}
            realtimeStatus={realtime.status}
            realtimeMessage={realtime.message}
            latestTranscript={realtime.latestTranscript}
            onStartMeeting={() => void startMeeting()}
            onCloseOverlay={closeOverlay}
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
      {fallbackOverlayOpen ? <div className={`floating-overlay-fallback ${floatingOverlayMode}`}>{floatingOverlay}</div> : null}
    </div>
  );
}
