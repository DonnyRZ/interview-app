import type {
  DeleteLiveMeetingSessionResponse,
  EndLiveMeetingRequest,
  GenerateMeetingAnswerRequest,
  GenerateMeetingAnswerResponse,
  GenerateMeetingExplanationRequest,
  GenerateMeetingExplanationResponse,
  GenerateMeetingFollowupRequest,
  GenerateMeetingFollowupResponse,
  GenerateMeetingKeywordHelpRequest,
  GenerateMeetingKeywordHelpResponse,
  LiveMeetingSessionListResponse,
  LiveMeetingSessionResponse,
  SurfaceRealtimeKeywordsRequest,
  SurfaceRealtimeKeywordsResponse,
  StartLiveMeetingRequest
} from "@interview-app/shared";
import { apiRequest } from "../../lib/api-client.js";

export function getLiveMeetingSessions(meetingContextId: string) {
  return apiRequest<LiveMeetingSessionListResponse>(`/live-meetings/meeting-context/${meetingContextId}`);
}

export function startLiveMeeting(input: StartLiveMeetingRequest) {
  return apiRequest<LiveMeetingSessionResponse>("/live-meetings/start", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
}

export function endLiveMeeting(liveMeetingSessionId: string, input: EndLiveMeetingRequest = {}) {
  return apiRequest<LiveMeetingSessionResponse>(`/live-meetings/${liveMeetingSessionId}/end`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
}

export function deleteLiveMeetingSession(liveMeetingSessionId: string) {
  return apiRequest<DeleteLiveMeetingSessionResponse>(`/live-meetings/${liveMeetingSessionId}`, {
    method: "DELETE"
  });
}

export function generateMeetingAnswer(input: GenerateMeetingAnswerRequest) {
  return apiRequest<GenerateMeetingAnswerResponse>("/live-meetings/answer", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
}

export function generateMeetingFollowup(input: GenerateMeetingFollowupRequest) {
  return apiRequest<GenerateMeetingFollowupResponse>("/live-meetings/followup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
}

export function generateMeetingExplanation(input: GenerateMeetingExplanationRequest) {
  return apiRequest<GenerateMeetingExplanationResponse>("/live-meetings/explain", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
}

export function generateMeetingKeywordHelp(input: GenerateMeetingKeywordHelpRequest) {
  return apiRequest<GenerateMeetingKeywordHelpResponse>("/live-meetings/keyword-help", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
}

export function surfaceRuntimeKeywords(input: SurfaceRealtimeKeywordsRequest) {
  return apiRequest<SurfaceRealtimeKeywordsResponse>("/live-meetings/runtime-keywords", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
}
