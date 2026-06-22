import { apiRequest } from "../../lib/api-client.js";

type LiveMeetingSessionResponse = {
  liveMeetingSession: {
    id: string;
  };
};

export type RealtimeClientSecret = {
  model: "gpt-realtime-mini";
  clientSecret: string;
  expiresAt: number;
};

export async function startLiveMeeting(meetingContextId: string) {
  return apiRequest<LiveMeetingSessionResponse>("/live-meetings/start", {
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
  await apiRequest(`/live-meetings/${encodeURIComponent(liveMeetingSessionId)}/end`, {
    method: "POST",
    body: JSON.stringify({ transcriptText })
  });
}
