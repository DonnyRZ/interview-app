import type { InterviewRound, InterviewStage } from "@interview-app/shared";
import type { interviewRounds } from "../../db/schema/index.js";

type InterviewRoundRow = typeof interviewRounds.$inferSelect;

export function mapInterviewRound(row: InterviewRoundRow): InterviewRound {
  return {
    id: row.id,
    applicationId: row.applicationId,
    stageType: row.stageType as InterviewStage,
    transcriptText: row.transcriptText,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString()
  };
}
