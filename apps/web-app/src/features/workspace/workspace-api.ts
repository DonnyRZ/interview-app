import type {
  ActiveProfileDocumentResponse,
  CreateMeetingContextRequest,
  DeleteMeetingContextResponse,
  DeleteProfileDocumentResponse,
  MeetingContextListResponse,
  MeetingContextResponse,
  UpdateMeetingContextRequest,
  ProfileDocumentListResponse,
  RetryProfileDocumentProcessingResponse,
  SetActiveProfileDocumentResponse,
  UploadProfileDocumentResponse
} from "@interview-app/shared";
import { apiRequest } from "../../lib/api-client.js";

export function getActiveProfileDocument() {
  return apiRequest<ActiveProfileDocumentResponse>("/profile-documents/active");
}

export function getProfileDocuments() {
  return apiRequest<ProfileDocumentListResponse>("/profile-documents/list");
}

export function uploadProfileDocument(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return apiRequest<UploadProfileDocumentResponse>("/profile-documents/upload", {
    method: "POST",
    body: formData
  });
}

export function setActiveProfileDocument(profileDocumentId: string) {
  return apiRequest<SetActiveProfileDocumentResponse>(`/profile-documents/${profileDocumentId}/set-active`, {
    method: "POST"
  });
}

export function retryProfileDocumentProcessing(profileDocumentId: string) {
  return apiRequest<RetryProfileDocumentProcessingResponse>(`/profile-documents/${profileDocumentId}/retry-processing`, {
    method: "POST"
  });
}

export function deleteProfileDocument(profileDocumentId: string) {
  return apiRequest<DeleteProfileDocumentResponse>(`/profile-documents/${profileDocumentId}`, {
    method: "DELETE"
  });
}

export function getMeetingContexts() {
  return apiRequest<MeetingContextListResponse>("/meeting-contexts/");
}

export function createMeetingContext(input: CreateMeetingContextRequest) {
  return apiRequest<MeetingContextResponse>("/meeting-contexts/", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function deleteMeetingContext(meetingContextId: string) {
  return apiRequest<DeleteMeetingContextResponse>(`/meeting-contexts/${meetingContextId}`, {
    method: "DELETE"
  });
}

export function updateMeetingContext(meetingContextId: string, input: UpdateMeetingContextRequest) {
  return apiRequest<MeetingContextResponse>(`/meeting-contexts/${meetingContextId}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}
