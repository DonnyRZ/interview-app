import type {
  EndInterviewRequest,
  GenerateInterviewAnswerRequest,
  GenerateInterviewAnswerResponse,
  GenerateInterviewExplanationRequest,
  GenerateInterviewExplanationResponse,
  GenerateInterviewFollowupRequest,
  GenerateInterviewFollowupResponse,
  GenerateInterviewKeywordHelpRequest,
  GenerateInterviewKeywordHelpResponse,
  InterviewRoundListResponse,
  InterviewRoundResponse,
  SurfaceRealtimeKeywordsRequest,
  SurfaceRealtimeKeywordsResponse,
  StartInterviewRequest
} from "@interview-app/shared";
import { apiRequest } from "../../lib/api-client.js";

export function getInterviewRounds(applicationId: string) {
  return apiRequest<InterviewRoundListResponse>(`/interviews/application/${applicationId}`);
}

export function startInterview(input: StartInterviewRequest) {
  return apiRequest<InterviewRoundResponse>("/interviews/start", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
}

export function endInterview(interviewRoundId: string, input: EndInterviewRequest = {}) {
  return apiRequest<InterviewRoundResponse>(`/interviews/${interviewRoundId}/end`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
}

export function generateInterviewAnswer(input: GenerateInterviewAnswerRequest) {
  return apiRequest<GenerateInterviewAnswerResponse>("/interviews/answer", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
}

export function generateInterviewFollowup(input: GenerateInterviewFollowupRequest) {
  return apiRequest<GenerateInterviewFollowupResponse>("/interviews/followup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
}

export function generateInterviewExplanation(input: GenerateInterviewExplanationRequest) {
  return apiRequest<GenerateInterviewExplanationResponse>("/interviews/explain", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
}

export function generateInterviewKeywordHelp(input: GenerateInterviewKeywordHelpRequest) {
  return apiRequest<GenerateInterviewKeywordHelpResponse>("/interviews/keyword-help", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
}

export function surfaceRuntimeKeywords(input: SurfaceRealtimeKeywordsRequest) {
  return apiRequest<SurfaceRealtimeKeywordsResponse>("/interviews/runtime-keywords", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
}
