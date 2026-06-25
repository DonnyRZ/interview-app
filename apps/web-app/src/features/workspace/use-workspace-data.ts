import type { CreateMeetingContextRequest, MeetingContext, ProfileDocument } from "@interview-app/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createMeetingContext,
  deleteMeetingContext,
  deleteProfileDocument,
  getActiveProfileDocument,
  getMeetingContexts,
  getProfileDocuments,
  retryProfileDocumentProcessing,
  setActiveProfileDocument,
  updateMeetingContext,
  uploadProfileDocument
} from "./workspace-api.js";
import { mapWorkspaceMeetingContext } from "./workspace-model.js";

export type WorkspaceBusyAction =
  | "loading"
  | "uploading-profile"
  | "updating-profile"
  | "creating-context"
  | "updating-context"
  | "deleting-context"
  | null;

export function useWorkspaceData() {
  const [activeProfile, setActiveProfile] = useState<ProfileDocument | null>(null);
  const [profileDocuments, setProfileDocuments] = useState<ProfileDocument[]>([]);
  const [meetingContextRecords, setMeetingContextRecords] = useState<MeetingContext[]>([]);
  const [busyAction, setBusyAction] = useState<WorkspaceBusyAction>("loading");
  const [profileMessage, setProfileMessage] = useState("Memuat profil user...");
  const [contextMessage, setContextMessage] = useState("Memuat konteks meeting...");
  const [profileError, setProfileError] = useState("");
  const [contextError, setContextError] = useState("");
  const mountedRef = useRef(true);

  const refreshProfiles = useCallback(async (silent = false) => {
    if (!silent) setBusyAction("loading");
    try {
      const [activeResponse, listResponse] = await Promise.all([
        getActiveProfileDocument(),
        getProfileDocuments()
      ]);
      if (!mountedRef.current) return;
      setActiveProfile(activeResponse.profileDocument);
      setProfileDocuments(listResponse.profileDocuments);
      setProfileError("");
      if (!silent) setBusyAction(null);
    } catch (caught) {
      if (mountedRef.current) setProfileError(getErrorMessage(caught, "Profil belum berhasil dimuat."));
      throw caught;
    }
  }, []);

  const refreshMeetingContexts = useCallback(async (silent = false) => {
    if (!silent) setBusyAction("loading");
    try {
      const response = await getMeetingContexts();
      if (!mountedRef.current) return;
      setMeetingContextRecords(response.meetingContexts);
      setContextError("");
      if (!silent) setBusyAction(null);
    } catch (caught) {
      if (mountedRef.current) setContextError(getErrorMessage(caught, "Konteks meeting belum berhasil dimuat."));
      throw caught;
    }
  }, []);

  const refreshWorkspace = useCallback(async () => {
    setBusyAction("loading");
    setProfileError("");
    setContextError("");
    const [profilesResult, contextsResult] = await Promise.allSettled([
      refreshProfiles(true),
      refreshMeetingContexts(true)
    ]);
    if (!mountedRef.current) return;
    setBusyAction(null);
    if (profilesResult.status === "fulfilled") setProfileMessage("Profil user siap digunakan.");
    if (contextsResult.status === "fulfilled") setContextMessage("Konteks meeting siap digunakan.");
  }, [refreshMeetingContexts, refreshProfiles]);

  useEffect(() => {
    mountedRef.current = true;
    void refreshWorkspace();
    return () => { mountedRef.current = false; };
  }, [refreshWorkspace]);

  useEffect(() => {
    if (!profileDocuments.some((profile) => profile.processingStatus === "uploaded" || profile.processingStatus === "processing")) {
      return;
    }
    const poll = window.setInterval(() => {
      void refreshProfiles(true).catch(() => undefined);
    }, 1_600);
    return () => window.clearInterval(poll);
  }, [profileDocuments, refreshProfiles]);

  const meetingContexts = useMemo(
    () => meetingContextRecords.map(mapWorkspaceMeetingContext),
    [meetingContextRecords]
  );

  const runAction = useCallback(async <T,>(
    scope: "profile" | "context",
    action: Exclude<WorkspaceBusyAction, "loading" | null>,
    operation: () => Promise<T>,
    successMessage: (result: T) => string
  ) => {
    setBusyAction(action);
    if (scope === "profile") setProfileError("");
    else setContextError("");
    try {
      const result = await operation();
      if (mountedRef.current) {
        if (scope === "profile") setProfileMessage(successMessage(result));
        else setContextMessage(successMessage(result));
      }
      return result;
    } catch (caught) {
      const nextError = getErrorMessage(caught, "Operasi workspace gagal.");
      if (mountedRef.current) {
        if (scope === "profile") setProfileError(nextError);
        else setContextError(nextError);
      }
      throw caught;
    } finally {
      if (mountedRef.current) setBusyAction(null);
    }
  }, []);

  const uploadProfile = useCallback(async (file: File) => {
    const response = await runAction(
      "profile",
      "uploading-profile",
      () => uploadProfileDocument(file),
      (result) => `${result.profileDocument.fileName} berhasil diupload dan sedang diproses AI.`
    );
    await refreshProfiles(true);
    return response.profileDocument;
  }, [refreshProfiles, runAction]);

  const activateProfile = useCallback(async (profile: ProfileDocument) => {
    const response = await runAction(
      "profile",
      "updating-profile",
      () => setActiveProfileDocument(profile.id),
      (result) => `${result.profileDocument.fileName} menjadi profil default.`
    );
    await refreshProfiles(true);
    return response.profileDocument;
  }, [refreshProfiles, runAction]);

  const retryProfile = useCallback(async (profile: ProfileDocument) => {
    const response = await runAction(
      "profile",
      "updating-profile",
      () => retryProfileDocumentProcessing(profile.id),
      (result) => `${result.profileDocument.fileName} sedang diproses ulang.`
    );
    await refreshProfiles(true);
    return response.profileDocument;
  }, [refreshProfiles, runAction]);

  const removeProfile = useCallback(async (profile: ProfileDocument) => {
    await runAction(
      "profile",
      "updating-profile",
      () => deleteProfileDocument(profile.id),
      () => `${profile.fileName} berhasil dihapus.`
    );
    await refreshProfiles(true);
  }, [refreshProfiles, runAction]);

  const addMeetingContext = useCallback(async (input: CreateMeetingContextRequest) => {
    const response = await runAction(
      "context",
      "creating-context",
      () => createMeetingContext(input),
      (result) => `${result.meetingContext.contextName} berhasil dibuat.`
    );
    await refreshMeetingContexts(true);
    return mapWorkspaceMeetingContext(response.meetingContext);
  }, [refreshMeetingContexts, runAction]);

  const removeMeetingContext = useCallback(async (meetingContext: MeetingContext) => {
    await runAction(
      "context",
      "deleting-context",
      () => deleteMeetingContext(meetingContext.id),
      () => `${meetingContext.contextName} - ${meetingContext.meetingTopic} berhasil dihapus.`
    );
    await refreshMeetingContexts(true);
  }, [refreshMeetingContexts, runAction]);

  const selectContextProfile = useCallback(async (meetingContext: MeetingContext, profile: ProfileDocument) => {
    const response = await runAction(
      "context",
      "updating-context",
      () => updateMeetingContext(meetingContext.id, { profileDocumentId: profile.id }),
      () => `${profile.fileName} sekarang dipakai oleh ${meetingContext.contextName}.`
    );
    await refreshMeetingContexts(true);
    return mapWorkspaceMeetingContext(response.meetingContext);
  }, [refreshMeetingContexts, runAction]);

  return {
    activeProfile,
    profileDocuments,
    meetingContexts,
    busyAction,
    loading: busyAction === "loading",
    profileMessage,
    contextMessage,
    profileError,
    contextError,
    refreshWorkspace,
    uploadProfile,
    activateProfile,
    retryProfile,
    removeProfile,
    addMeetingContext,
    removeMeetingContext,
    selectContextProfile
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
