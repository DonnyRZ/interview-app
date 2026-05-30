import type {
  ActiveProfileDocumentResponse,
  ProfileDocumentListResponse,
  DeleteProfileDocumentResponse,
  RetryProfileDocumentProcessingResponse,
  SetActiveProfileDocumentResponse,
  UploadProfileDocumentResponse
} from "@interview-app/shared";
import { apiRequest } from "../../lib/api-client.js";

export function getActiveProfileDocument() {
  return apiRequest<ActiveProfileDocumentResponse>("/profile-documents/active");
}

export function getProfileDocumentList() {
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
