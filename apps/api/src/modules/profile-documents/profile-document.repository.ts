import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { meetingContexts, profileDocuments, userProfiles } from "../../db/schema/index.js";

export type CreateProfileDocumentInput = {
  userId: string;
  fileName: string;
  filePath: string;
  fileMimeType?: string;
  summaryJson?: unknown;
  readyContext?: string;
  processingStatus?: "uploaded" | "processing" | "ready" | "failed";
  processingError?: string | null;
};

export async function listProfileDocuments(userId: string) {
  return db.query.profileDocuments.findMany({
    where: eq(profileDocuments.userId, userId),
    orderBy: [desc(profileDocuments.createdAt)]
  });
}

export async function findActiveProfileDocument(userId: string) {
  return db.query.profileDocuments.findFirst({
    where: and(eq(profileDocuments.userId, userId), eq(profileDocuments.isActive, true)),
    orderBy: [desc(profileDocuments.createdAt)]
  });
}

export async function findProfileDocumentById(userId: string, profileDocumentId: string) {
  return db.query.profileDocuments.findFirst({
    where: and(eq(profileDocuments.userId, userId), eq(profileDocuments.id, profileDocumentId))
  });
}

export async function findMeetingContextUsingProfileDocument(userId: string, profileDocumentId: string) {
  return db.query.meetingContexts.findFirst({
    where: and(eq(meetingContexts.userId, userId), eq(meetingContexts.profileDocumentId, profileDocumentId))
  });
}

export async function findLatestReadyProfileDocumentExcluding(userId: string, excludedProfileDocumentId: string) {
  const documents = await db.query.profileDocuments.findMany({
    where: and(eq(profileDocuments.userId, userId), eq(profileDocuments.processingStatus, "ready")),
    orderBy: [desc(profileDocuments.createdAt)]
  });

  return documents.find((profileDocument) => profileDocument.id !== excludedProfileDocumentId) || null;
}

export async function createProfileDocument(input: CreateProfileDocumentInput) {
  const [createdProfileDocument] = await db.insert(profileDocuments).values({
    userId: input.userId,
    fileName: input.fileName,
    filePath: input.filePath,
    fileMimeType: input.fileMimeType,
    summaryJson: input.summaryJson,
    readyContext: input.readyContext,
    processingStatus: input.processingStatus,
    processingError: input.processingError,
    isActive: false
  }).returning();

  if (!createdProfileDocument) {
    throw new Error("Failed to create profile document");
  }

  await setActiveProfileDocument(input.userId, createdProfileDocument.id);
  return createdProfileDocument;
}

export async function setActiveProfileDocument(userId: string, profileDocumentId: string) {
  await db.transaction(async (tx) => {
    const [targetProfileDocument] = await tx.select({ id: profileDocuments.id })
      .from(profileDocuments)
      .where(and(eq(profileDocuments.userId, userId), eq(profileDocuments.id, profileDocumentId)))
      .limit(1);

    if (!targetProfileDocument) {
      throw new Error("Profile document not found");
    }

    await tx.update(profileDocuments)
      .set({ isActive: false })
      .where(eq(profileDocuments.userId, userId));

    await tx.update(profileDocuments)
      .set({ isActive: true })
      .where(and(eq(profileDocuments.userId, userId), eq(profileDocuments.id, profileDocumentId)));

    await tx.update(userProfiles)
      .set({ activeProfileDocumentId: null, updatedAt: new Date() })
      .where(eq(userProfiles.userId, userId));
  });

  return findProfileDocumentById(userId, profileDocumentId);
}

export async function updateProfileDocumentProcessingState(
  userId: string,
  profileDocumentId: string,
  input: {
    summaryJson?: unknown;
    readyContext?: string | null;
    processingStatus: "uploaded" | "processing" | "ready" | "failed";
    processingError?: string | null;
  }
) {
  const [updatedProfileDocument] = await db.update(profileDocuments)
    .set({
      summaryJson: input.summaryJson,
      readyContext: input.readyContext,
      processingStatus: input.processingStatus,
      processingError: input.processingError
    })
    .where(and(eq(profileDocuments.userId, userId), eq(profileDocuments.id, profileDocumentId)))
    .returning();

  return updatedProfileDocument || null;
}

export async function deleteProfileDocument(userId: string, profileDocumentId: string) {
  const [deletedProfileDocument] = await db.transaction(async (tx) => {
    await tx.update(userProfiles)
      .set({ activeProfileDocumentId: null, updatedAt: new Date() })
      .where(and(eq(userProfiles.userId, userId), eq(userProfiles.activeProfileDocumentId, profileDocumentId)));

    return tx.delete(profileDocuments)
      .where(and(eq(profileDocuments.userId, userId), eq(profileDocuments.id, profileDocumentId)))
      .returning({
        id: profileDocuments.id,
        filePath: profileDocuments.filePath
      });
  });

  return deletedProfileDocument || null;
}
