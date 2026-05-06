import type { InterviewStage } from "@interview-app/shared";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { interviewRounds } from "../../db/schema/index.js";

export async function listInterviewRounds(userId: string, applicationId: string) {
  return db.query.interviewRounds.findMany({
    where: and(eq(interviewRounds.userId, userId), eq(interviewRounds.applicationId, applicationId)),
    orderBy: [desc(interviewRounds.createdAt)]
  });
}

export async function findInterviewRoundById(userId: string, interviewRoundId: string) {
  return db.query.interviewRounds.findFirst({
    where: and(eq(interviewRounds.userId, userId), eq(interviewRounds.id, interviewRoundId))
  });
}

export async function startInterviewRound(userId: string, applicationId: string, stageType: InterviewStage) {
  const [createdRound] = await db.insert(interviewRounds).values({
    userId,
    applicationId,
    stageType
  }).returning();

  if (!createdRound) {
    throw new Error("Failed to start interview round");
  }

  return createdRound;
}

export async function endInterviewRound(userId: string, interviewRoundId: string, transcriptText?: string) {
  const [updatedRound] = await db.update(interviewRounds)
    .set({
      transcriptText,
      endedAt: new Date()
    })
    .where(and(eq(interviewRounds.userId, userId), eq(interviewRounds.id, interviewRoundId)))
    .returning();

  return updatedRound || null;
}
