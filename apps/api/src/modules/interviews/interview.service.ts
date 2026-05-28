import type { EndInterviewRequest, StartInterviewRequest } from "@interview-app/shared";
import { findApplicationById } from "../applications/application.repository.js";
import { findCvById } from "../cv/cv.repository.js";
import { DEV_USER_ID } from "../dev/dev-user.js";
import { ensureDevUser } from "../dev/dev-user.repository.js";
import {
  deleteInterviewRound,
  endInterviewRound,
  findInterviewRoundById,
  listInterviewRounds,
  startInterviewRound
} from "./interview.repository.js";
import { buildRealtimeContext } from "./realtime-context.js";

export async function getInterviewRoundsForDevUser(applicationId: string) {
  await ensureDevUser();
  return listInterviewRounds(DEV_USER_ID, applicationId);
}

export async function startInterviewForDevUser(input: StartInterviewRequest) {
  await ensureDevUser();

  const application = await findApplicationById(DEV_USER_ID, input.applicationId);
  if (!application) {
    throw new Error("Application not found");
  }

  const cv = await findCvById(DEV_USER_ID, application.cvId);
  if (!cv) {
    throw new Error("Application CV not found");
  }

  const round = await startInterviewRound(DEV_USER_ID, input.applicationId, input.stageType);
  return {
    round,
    realtimeContext: buildRealtimeContext({
      cv,
      application,
      stageType: input.stageType
    })
  };
}

export async function endInterviewForDevUser(interviewRoundId: string, input: EndInterviewRequest) {
  await ensureDevUser();

  const existingRound = await findInterviewRoundById(DEV_USER_ID, interviewRoundId);
  if (!existingRound) {
    return null;
  }

  return endInterviewRound(DEV_USER_ID, interviewRoundId, input.transcriptText);
}

export async function deleteInterviewRoundForDevUser(interviewRoundId: string) {
  await ensureDevUser();

  const existingRound = await findInterviewRoundById(DEV_USER_ID, interviewRoundId);
  if (!existingRound) {
    return null;
  }

  if (!existingRound.endedAt) {
    throw new Error("Live interview round cannot be deleted. End the interview first.");
  }

  return deleteInterviewRound(DEV_USER_ID, interviewRoundId);
}
