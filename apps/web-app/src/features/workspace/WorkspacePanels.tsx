import type { ProfileDocument } from "@interview-app/shared";
import type { ChangeEvent, FormEvent } from "react";
import type { WorkspaceBusyAction } from "./use-workspace-data.js";
import {
  formatWorkspaceDate,
  getProfileStatusMessage,
  getProfileStatusTitle,
  getProfileSummary,
  type WorkspaceMeetingContext
} from "./workspace-model.js";

type ProfilePanelProps = {
  activeProfile: ProfileDocument | null;
  profiles: ProfileDocument[];
  busyAction: WorkspaceBusyAction;
  loading: boolean;
  message: string;
  error: string;
  onUpload(file: File): void;
  onActivate(profile: ProfileDocument): void;
  onRetry(profile: ProfileDocument): void;
  onDelete(profile: ProfileDocument): void;
};

export function ProfileReferencePanel({
  activeProfile,
  profiles,
  busyAction,
  loading,
  message,
  error,
  onUpload,
  onActivate,
  onRetry,
  onDelete
}: ProfilePanelProps) {
  const profileBusy = busyAction === "uploading-profile" || busyAction === "updating-profile";

  function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) onUpload(file);
  }

  return (
    <section className="panel workspace-pane profile-pane" aria-labelledby="profile-reference-title">
      <div className="panel-head workspace-pane-head">
        <h2 id="profile-reference-title">Profil &amp; Referensi User</h2>
      </div>

      <div className="workspace-pane-scroll">
        <div className="profile-pane-content">
          {loading ? <WorkspaceLoading label="Memuat profil user..." /> : (
            <>
              <div className="dashboard-profile-grid">
                <article className="dashboard-profile-card">
                  <b className="summary-label">Profil Default</b>
                  <strong>{activeProfile?.fileName || "Belum ada profil default"}</strong>
                  <p>
                    {activeProfile
                      ? `Diupload ${formatWorkspaceDate(activeProfile.createdAt)}. Profil ini menjadi default untuk konteks meeting baru.`
                      : "Upload profil pertama untuk mulai membuat referensi user dan membuka workflow konteks meeting."}
                  </p>
                  <div className="dashboard-card-actions">
                    <label className={`primary-btn dashboard-upload-btn upload-btn ${profileBusy ? "disabled" : ""}`}>
                      {busyAction === "uploading-profile" ? "Mengupload..." : "Upload Profil Baru"}
                      <input type="file" accept=".pdf,.doc,.docx" disabled={profileBusy} onChange={handleUpload} />
                    </label>
                  </div>
                </article>

                <article className={`dashboard-profile-card dashboard-status-card ${activeProfile?.processingStatus || "uploaded"}`}>
                  <b className="summary-label">Status AI</b>
                  <strong>{getProfileStatusTitle(activeProfile)}</strong>
                  <p>{getProfileStatusMessage(activeProfile)}</p>
                  {activeProfile?.processingStatus === "failed" ? (
                    <button className="secondary-btn small" type="button" disabled={profileBusy} onClick={() => onRetry(activeProfile)}>
                      Proses Ulang
                    </button>
                  ) : null}
                </article>

                <article className="dashboard-profile-card">
                  <b className="summary-label">Ringkasan Profil</b>
                  <strong>{activeProfile?.fileName || "Profile summary"}</strong>
                  <p>{getProfileSummary(activeProfile)}</p>
                </article>
              </div>

              {profiles.length ? (
                <div className="dashboard-history-panel">
                  <h3>Riwayat Versi Profil</h3>
                  <div className="dashboard-cv-history">
                    {profiles.map((profile) => (
                      <div className="dashboard-cv-row" key={profile.id}>
                        <div>
                          <strong>{profile.fileName}</strong>
                          <p>{getProfileStatusTitle(profile)} - diupload {formatWorkspaceDate(profile.createdAt)}</p>
                        </div>
                        <div className="dashboard-cv-actions">
                          {profile.isActive ? <span className="pill good">default</span> : null}
                          {!profile.isActive && profile.processingStatus === "ready" ? (
                            <button className="secondary-btn small" type="button" disabled={profileBusy} onClick={() => onActivate(profile)}>
                              Jadikan Default
                            </button>
                          ) : null}
                          {profile.processingStatus === "failed" ? (
                            <button className="secondary-btn small" type="button" disabled={profileBusy} onClick={() => onRetry(profile)}>
                              Ulangi
                            </button>
                          ) : null}
                          <button className="secondary-btn small danger-btn" type="button" disabled={profileBusy} onClick={() => onDelete(profile)}>
                            Hapus
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <WorkspaceNotice message={message} error={error} />
            </>
          )}
        </div>
      </div>
    </section>
  );
}

type MeetingContextPanelProps = {
  meetingContexts: WorkspaceMeetingContext[];
  activeProfile: ProfileDocument | null;
  busyAction: WorkspaceBusyAction;
  loading: boolean;
  creating: boolean;
  message: string;
  error: string;
  onToggleCreate(): void;
  onCreate(input: { contextName: string; meetingTopic: string; meetingBrief?: string }): void;
  onOpen(meetingContextId: string): void;
  onDelete(meetingContext: WorkspaceMeetingContext): void;
};

export function MeetingContextPanel({
  meetingContexts,
  activeProfile,
  busyAction,
  loading,
  creating,
  message,
  error,
  onToggleCreate,
  onCreate,
  onOpen,
  onDelete
}: MeetingContextPanelProps) {
  const contextBusy = busyAction === "creating-context" || busyAction === "deleting-context";
  const profileReady = activeProfile?.processingStatus === "ready";

  function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const contextName = String(formData.get("contextName") || "").trim();
    const meetingTopic = String(formData.get("meetingTopic") || "").trim();
    const meetingBrief = String(formData.get("meetingBrief") || "").trim();
    if (!contextName || !meetingTopic) return;
    onCreate({ contextName, meetingTopic, meetingBrief: meetingBrief || undefined });
  }

  return (
    <section className="panel workspace-pane context-pane" aria-labelledby="meeting-context-title">
      <div className="panel-head workspace-pane-head">
        <h2 id="meeting-context-title">{creating ? "Buat Konteks Meeting" : "Konteks Meeting"}</h2>
        <button
          className={creating ? "secondary-btn small" : "primary-btn icon-btn new-session-btn"}
          type="button"
          onClick={onToggleCreate}
          disabled={!creating && !profileReady}
          aria-label={creating ? "Batalkan konteks meeting baru" : "Buat konteks meeting baru"}
          title={!creating && !profileReady ? "Profil default harus AI Ready." : undefined}
        >
          {creating ? "Batal" : (
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          )}
        </button>
      </div>

      <div className="workspace-pane-scroll">
        {loading ? <WorkspaceLoading label="Memuat konteks meeting..." /> : creating ? (
          <form className="context-create-form" onSubmit={submitCreate}>
            <p className="form-intro">AI akan menggabungkan brief ini dengan profil default untuk membuat ringkasan dan konteks persiapan.</p>
            <label className="workspace-field">
              <span>Nama konteks</span>
              <input name="contextName" required placeholder="Weekly Product Sync" disabled={contextBusy} />
            </label>
            <label className="workspace-field">
              <span>Topik meeting</span>
              <input name="meetingTopic" required placeholder="Roadmap planning" disabled={contextBusy} />
            </label>
            <label className="workspace-field">
              <span>Brief / konteks meeting</span>
              <textarea name="meetingBrief" rows={8} placeholder="Agenda, dokumen, atau konteks penting..." disabled={contextBusy} />
            </label>
            <div className="context-form-profile">
              <span className="summary-label">Profil Default</span>
              <strong>{activeProfile?.fileName}</strong>
            </div>
            <button className="primary-btn" type="submit" disabled={!profileReady || contextBusy}>
              {busyAction === "creating-context" ? "Menganalisis Konteks..." : "Simpan Konteks Meeting"}
            </button>
            <WorkspaceNotice message={message} error={error} />
          </form>
        ) : (
          <div className="context-panel-content">
            {meetingContexts.length ? (
              <div className="dashboard-table">
                {meetingContexts.map((meetingContext) => (
                  <article className="dashboard-app-row" key={meetingContext.id}>
                    <div className="dashboard-app-title">
                      <div className="dashboard-app-title-line">
                        <strong>{meetingContext.contextName} - {meetingContext.meetingTopic}</strong>
                      </div>
                      <span>Fokus: {meetingContext.focus}</span>
                    </div>
                    <div className="dashboard-row-actions">
                      <button className="secondary-btn dashboard-action-btn open-action-btn" type="button" onClick={() => onOpen(meetingContext.id)}>
                        Buka
                      </button>
                      <button className="secondary-btn small danger-btn" type="button" disabled={contextBusy} onClick={() => onDelete(meetingContext)}>
                        Hapus
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="workspace-empty-state">
                <strong>Belum ada konteks meeting</strong>
                <p>Buat konteks pertama setelah profil default selesai diproses AI.</p>
              </div>
            )}
            <WorkspaceNotice message={message} error={error} />
          </div>
        )}
      </div>
    </section>
  );
}

function WorkspaceLoading({ label }: { label: string }) {
  return <div className="workspace-loading" role="status"><span />{label}</div>;
}

function WorkspaceNotice({ message, error }: { message: string; error: string }) {
  return (
    <div className={`status-card slim workspace-notice ${error ? "error" : ""}`} role="status">
      <strong>{error ? "Belum Berhasil" : "Status"}</strong>
      <p>{error || message}</p>
    </div>
  );
}
