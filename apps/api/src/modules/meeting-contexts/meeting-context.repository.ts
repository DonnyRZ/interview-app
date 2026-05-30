import type { CreateMeetingContextRequest, UpdateMeetingContextRequest } from "@interview-app/shared";
import { desc, and, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { meetingContexts } from "../../db/schema/index.js";

export type CreateMeetingContextInput = CreateMeetingContextRequest & {
  meetingSummaryJson?: unknown;
  meetingContextText?: string;
};

export type UpdateMeetingContextInput = UpdateMeetingContextRequest & {
  meetingSummaryJson?: unknown;
  meetingContextText?: string;
};

export async function listMeetingContexts(userId: string) {
  return db.query.meetingContexts.findMany({
    where: eq(meetingContexts.userId, userId),
    orderBy: [desc(meetingContexts.createdAt)]
  });
}

export async function findMeetingContextById(userId: string, meetingContextId: string) {
  return db.query.meetingContexts.findFirst({
    where: and(eq(meetingContexts.userId, userId), eq(meetingContexts.id, meetingContextId))
  });
}

export async function createMeetingContext(userId: string, profileDocumentId: string, input: CreateMeetingContextInput) {
  const [createdMeetingContext] = await db.insert(meetingContexts).values({
    userId,
    profileDocumentId,
    contextName: input.contextName,
    meetingTopic: input.meetingTopic,
    meetingBrief: input.meetingBrief,
    meetingSummaryJson: input.meetingSummaryJson,
    meetingContextText: input.meetingContextText
  }).returning();

  if (!createdMeetingContext) {
    throw new Error("Failed to create meetingContext");
  }

  return createdMeetingContext;
}

export async function updateMeetingContext(userId: string, meetingContextId: string, input: UpdateMeetingContextInput) {
  const [updatedMeetingContext] = await db.update(meetingContexts)
    .set({
      ...input,
      updatedAt: new Date()
    })
    .where(and(eq(meetingContexts.userId, userId), eq(meetingContexts.id, meetingContextId)))
    .returning();

  return updatedMeetingContext || null;
}

export async function deleteMeetingContext(userId: string, meetingContextId: string) {
  const [deletedMeetingContext] = await db.delete(meetingContexts)
    .where(and(eq(meetingContexts.userId, userId), eq(meetingContexts.id, meetingContextId)))
    .returning({ id: meetingContexts.id });

  return deletedMeetingContext || null;
}
