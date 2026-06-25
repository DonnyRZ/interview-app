import type { MeetingSessionType } from "@interview-app/shared";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../../db/client.js";
import { liveMeetingSessions } from "../../db/schema/index.js";

export async function listLiveMeetingSessions(
  userId: string,
  meetingContextId: string,
  pagination = { limit: 50, offset: 0 }
) {
  return db.query.liveMeetingSessions.findMany({
    where: and(eq(liveMeetingSessions.userId, userId), eq(liveMeetingSessions.meetingContextId, meetingContextId)),
    orderBy: [desc(liveMeetingSessions.createdAt)],
    limit: pagination.limit,
    offset: pagination.offset
  });
}

export async function findLiveMeetingSessionById(userId: string, liveMeetingSessionId: string) {
  return db.query.liveMeetingSessions.findFirst({
    where: and(eq(liveMeetingSessions.userId, userId), eq(liveMeetingSessions.id, liveMeetingSessionId))
  });
}

export async function startLiveMeetingSession(userId: string, meetingContextId: string, sessionType: MeetingSessionType) {
  const [createdRound] = await db.insert(liveMeetingSessions).values({
    userId,
    meetingContextId,
    sessionType
  }).returning();

  if (!createdRound) {
    throw new Error("Failed to start live meeting session");
  }

  return createdRound;
}

export async function endLiveMeetingSession(userId: string, liveMeetingSessionId: string, transcriptText?: string) {
  const [updatedRound] = await db.update(liveMeetingSessions)
    .set({
      transcriptText,
      endedAt: new Date()
    })
    .where(and(
      eq(liveMeetingSessions.userId, userId),
      eq(liveMeetingSessions.id, liveMeetingSessionId),
      isNull(liveMeetingSessions.endedAt)
    ))
    .returning();

  return updatedRound || findLiveMeetingSessionById(userId, liveMeetingSessionId);
}

export async function deleteLiveMeetingSession(userId: string, liveMeetingSessionId: string) {
  const [deletedRound] = await db.delete(liveMeetingSessions)
    .where(and(eq(liveMeetingSessions.userId, userId), eq(liveMeetingSessions.id, liveMeetingSessionId)))
    .returning({ id: liveMeetingSessions.id });

  return deletedRound || null;
}
