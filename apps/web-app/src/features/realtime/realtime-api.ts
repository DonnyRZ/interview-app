import type {
  DeleteLiveMeetingSessionResponse,
  EndLiveMeetingRequest,
  LiveMeetingSessionListResponse,
  LiveMeetingSessionResponse,
  RealtimeContext
} from "@interview-app/shared";
import { apiRequest } from "../../lib/api-client.js";

type StartLiveMeetingResponse = {
  liveMeetingSession: {
    id: string;
  };
  realtimeContext: RealtimeContext;
};

export type RealtimeClientSecret = {
  model: "gpt-realtime-mini";
  clientSecret: string;
  expiresAt: number;
};

export async function startLiveMeeting(meetingContextId: string) {
  return apiRequest<StartLiveMeetingResponse>("/live-meetings/start", {
    method: "POST",
    body: JSON.stringify({ meetingContextId, sessionType: "OTHER" })
  });
}

export async function createRealtimeClientSecret(liveMeetingSessionId: string) {
  return apiRequest<RealtimeClientSecret>("/live-meetings/realtime/client-secret", {
    method: "POST",
    body: JSON.stringify({ liveMeetingSessionId })
  });
}

export async function endLiveMeeting(liveMeetingSessionId: string, transcriptText: string) {
  return apiRequest<LiveMeetingSessionResponse>(`/live-meetings/${encodeURIComponent(liveMeetingSessionId)}/end`, {
    method: "POST",
    body: JSON.stringify({ transcriptText } satisfies EndLiveMeetingRequest)
  });
}

export function getLiveMeetingSessions(meetingContextId: string) {
  return apiRequest<LiveMeetingSessionListResponse>(`/live-meetings/meeting-context/${encodeURIComponent(meetingContextId)}`);
}

export function deleteLiveMeetingSession(liveMeetingSessionId: string) {
  return apiRequest<DeleteLiveMeetingSessionResponse>(`/live-meetings/${encodeURIComponent(liveMeetingSessionId)}`, { method: "DELETE" });
}
