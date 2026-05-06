import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { candidateCvs, candidateProfiles } from "../../db/schema/index.js";

export type CreateCvInput = {
  userId: string;
  fileName: string;
  filePath: string;
  fileMimeType?: string;
  summaryJson?: unknown;
  readyContext?: string;
  processingStatus?: "uploaded" | "processing" | "ready" | "failed";
  processingError?: string | null;
};

export async function listCvs(userId: string) {
  return db.query.candidateCvs.findMany({
    where: eq(candidateCvs.userId, userId),
    orderBy: [desc(candidateCvs.createdAt)]
  });
}

export async function findActiveCv(userId: string) {
  return db.query.candidateCvs.findFirst({
    where: and(eq(candidateCvs.userId, userId), eq(candidateCvs.isActive, true)),
    orderBy: [desc(candidateCvs.createdAt)]
  });
}

export async function findCvById(userId: string, cvId: string) {
  return db.query.candidateCvs.findFirst({
    where: and(eq(candidateCvs.userId, userId), eq(candidateCvs.id, cvId))
  });
}

export async function createCv(input: CreateCvInput) {
  const [createdCv] = await db.insert(candidateCvs).values({
    userId: input.userId,
    fileName: input.fileName,
    filePath: input.filePath,
    fileMimeType: input.fileMimeType,
    summaryJson: input.summaryJson,
    readyContext: input.readyContext,
    processingStatus: input.processingStatus,
    processingError: input.processingError,
    isActive: true
  }).returning();

  if (!createdCv) {
    throw new Error("Failed to create CV");
  }

  await setActiveCv(input.userId, createdCv.id);
  return createdCv;
}

export async function setActiveCv(userId: string, cvId: string) {
  await db.transaction(async (tx) => {
    await tx.update(candidateCvs)
      .set({ isActive: false })
      .where(eq(candidateCvs.userId, userId));

    await tx.update(candidateCvs)
      .set({ isActive: true })
      .where(and(eq(candidateCvs.userId, userId), eq(candidateCvs.id, cvId)));

    await tx.update(candidateProfiles)
      .set({ activeCvId: cvId, updatedAt: new Date() })
      .where(eq(candidateProfiles.userId, userId));
  });

  return findCvById(userId, cvId);
}

export async function updateCvProcessingState(
  userId: string,
  cvId: string,
  input: {
    summaryJson?: unknown;
    readyContext?: string | null;
    processingStatus: "uploaded" | "processing" | "ready" | "failed";
    processingError?: string | null;
  }
) {
  const [updatedCv] = await db.update(candidateCvs)
    .set({
      summaryJson: input.summaryJson,
      readyContext: input.readyContext,
      processingStatus: input.processingStatus,
      processingError: input.processingError
    })
    .where(and(eq(candidateCvs.userId, userId), eq(candidateCvs.id, cvId)))
    .returning();

  return updatedCv || null;
}
