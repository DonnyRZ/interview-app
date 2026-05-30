import type { EndLiveMeetingRequest, StartLiveMeetingRequest } from "@interview-app/shared";
import { findMeetingContextById } from "../meeting-contexts/meeting-context.repository.js";
import { findProfileDocumentById } from "../profile-documents/profile-document.repository.js";
import { DEV_USER_ID } from "../dev/dev-user.js";
import { ensureDevUser } from "../dev/dev-user.repository.js";
import {
  deleteLiveMeetingSession,
  endLiveMeetingSession,
  findLiveMeetingSessionById,
  listLiveMeetingSessions,
  startLiveMeetingSession
} from "./live-meeting.repository.js";
import { buildRealtimeContext } from "./realtime-context.js";

export async function getLiveMeetingSessionsForDevUser(meetingContextId: string) {
  await ensureDevUser();
  const meetingContext = await findMeetingContextById(DEV_USER_ID, meetingContextId);
  if (!meetingContext) {
    return null;
  }

  return listLiveMeetingSessions(DEV_USER_ID, meetingContextId);
}

export async function startLiveMeetingForDevUser(input: StartLiveMeetingRequest) {
  await ensureDevUser();

  const meetingContext = await findMeetingContextById(DEV_USER_ID, input.meetingContextId);
  if (!meetingContext) {
    throw new Error("Meeting context not found");
  }

  const profileDocument = await findProfileDocumentById(DEV_USER_ID, meetingContext.profileDocumentId);
  if (!profileDocument) {
    throw new Error("Meeting context profile document not found.");
  }
  if (profileDocument.processingStatus !== "ready") {
    throw new Error("Meeting context profile document is not ready yet. Wait for AI processing or retry profile processing.");
  }

  const session = await startLiveMeetingSession(DEV_USER_ID, input.meetingContextId, input.sessionType);
  return {
    session,
    realtimeContext: buildRealtimeContext({
      profileDocument,
      meetingContext,
      sessionType: input.sessionType
    })
  };
}

export async function endLiveMeetingForDevUser(liveMeetingSessionId: string, input: EndLiveMeetingRequest) {
  await ensureDevUser();

  const existingRound = await findLiveMeetingSessionById(DEV_USER_ID, liveMeetingSessionId);
  if (!existingRound) {
    return null;
  }

  return endLiveMeetingSession(DEV_USER_ID, liveMeetingSessionId, input.transcriptText);
}

export async function deleteLiveMeetingSessionForDevUser(liveMeetingSessionId: string) {
  await ensureDevUser();

  const existingRound = await findLiveMeetingSessionById(DEV_USER_ID, liveMeetingSessionId);
  if (!existingRound) {
    return null;
  }

  if (!existingRound.endedAt) {
    throw new Error("Live meeting session cannot be deleted. End the meeting first.");
  }

  return deleteLiveMeetingSession(DEV_USER_ID, liveMeetingSessionId);
}
