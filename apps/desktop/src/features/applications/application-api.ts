import type {
  ApplicationListResponse,
  ApplicationResponse,
  CreateApplicationRequest
} from "@interview-app/shared";
import { apiRequest } from "../../lib/api-client.js";

export function getApplications() {
  return apiRequest<ApplicationListResponse>("/applications/");
}

export function getApplication(applicationId: string) {
  return apiRequest<ApplicationResponse>(`/applications/${applicationId}`);
}

export function createApplication(input: CreateApplicationRequest) {
  return apiRequest<ApplicationResponse>("/applications/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
}
