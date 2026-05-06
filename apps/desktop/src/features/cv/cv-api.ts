import type {
  ActiveCvResponse,
  CvListResponse,
  RetryCvProcessingResponse,
  SetActiveCvResponse,
  UploadCvResponse
} from "@interview-app/shared";
import { apiRequest } from "../../lib/api-client.js";

export function getActiveCv() {
  return apiRequest<ActiveCvResponse>("/cv/active");
}

export function getCvList() {
  return apiRequest<CvListResponse>("/cv/list");
}

export function uploadCv(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  return apiRequest<UploadCvResponse>("/cv/upload", {
    method: "POST",
    body: formData
  });
}

export function setActiveCv(cvId: string) {
  return apiRequest<SetActiveCvResponse>(`/cv/${cvId}/set-active`, {
    method: "POST"
  });
}

export function retryCvProcessing(cvId: string) {
  return apiRequest<RetryCvProcessingResponse>(`/cv/${cvId}/retry-processing`, {
    method: "POST"
  });
}
