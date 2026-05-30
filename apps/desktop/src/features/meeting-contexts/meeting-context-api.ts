import type {
  MeetingContextListResponse,
  MeetingContextResponse,
  CreateMeetingContextRequest,
  DeleteMeetingContextResponse,
  UpdateMeetingContextRequest
} from "@interview-app/shared";
import { apiRequest } from "../../lib/api-client.js";

export function getMeetingContexts() {
  return apiRequest<MeetingContextListResponse>("/meeting-contexts/");
}

export function getMeetingContext(meetingContextId: string) {
  return apiRequest<MeetingContextResponse>(`/meeting-contexts/${meetingContextId}`);
}

export function createMeetingContext(input: CreateMeetingContextRequest) {
  return apiRequest<MeetingContextResponse>("/meeting-contexts/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
}

export function updateMeetingContext(meetingContextId: string, input: UpdateMeetingContextRequest) {
  return apiRequest<MeetingContextResponse>(`/meeting-contexts/${meetingContextId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
}

export function deleteMeetingContext(meetingContextId: string) {
  return apiRequest<DeleteMeetingContextResponse>(`/meeting-contexts/${meetingContextId}`, {
    method: "DELETE"
  });
}
