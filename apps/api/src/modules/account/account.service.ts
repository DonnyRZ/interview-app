import { createHash } from "node:crypto";
import { unlink } from "node:fs/promises";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  accountDeletionJobs,
  authSessions,
  liveMeetingSessions,
  meetingContexts,
  paymentEvents,
  paymentIntents,
  profileDocuments,
  subscriptionPeriods,
  subscriptions,
  usageEvents,
  usageRollups,
  userProfiles,
  users
} from "../../db/schema/index.js";

export async function exportAccountData(userId: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId)
  });
  if (!user) {
    return null;
  }

  const [
    profile,
    documents,
    contexts,
    sessions,
    intents,
    subscriptionRows,
    periodRows,
    usageEventRows,
    usageRollupRows
  ] = await Promise.all([
    db.query.userProfiles.findFirst({ where: eq(userProfiles.userId, userId) }),
    db.query.profileDocuments.findMany({ where: eq(profileDocuments.userId, userId) }),
    db.query.meetingContexts.findMany({ where: eq(meetingContexts.userId, userId) }),
    db.query.liveMeetingSessions.findMany({ where: eq(liveMeetingSessions.userId, userId) }),
    db.query.paymentIntents.findMany({ where: eq(paymentIntents.userId, userId) }),
    db.query.subscriptions.findMany({ where: eq(subscriptions.userId, userId) }),
    db.query.subscriptionPeriods.findMany({ where: eq(subscriptionPeriods.userId, userId) }),
    db.query.usageEvents.findMany({ where: eq(usageEvents.userId, userId) }),
    db.query.usageRollups.findMany({ where: eq(usageRollups.userId, userId) })
  ]);

  const intentIds = intents.map((intent) => intent.id);
  const events = intentIds.length
    ? await db.query.paymentEvents.findMany({
      where: inArray(paymentEvents.paymentIntentId, intentIds)
    })
    : [];

  return {
    exportedAt: new Date().toISOString(),
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      authProvider: user.authProvider,
      subscriptionPlan: user.subscriptionPlan,
      subscriptionExpiresAt: user.subscriptionExpiresAt,
      createdAt: user.createdAt
    },
    profile,
    profileDocuments: documents.map((document) => ({
      id: document.id,
      fileName: document.fileName,
      fileMimeType: document.fileMimeType,
      summaryJson: document.summaryJson,
      readyContext: document.readyContext,
      processingStatus: document.processingStatus,
      processingError: document.processingError,
      isActive: document.isActive,
      createdAt: document.createdAt
    })),
    meetingContexts: contexts,
    liveMeetingSessions: sessions,
    payments: {
      intents: intents.map((intent) => ({
        publicId: intent.publicId,
        provider: intent.provider,
        providerOrderId: intent.providerOrderId,
        providerProductId: intent.providerProductId,
        plan: intent.plan,
        amount: intent.amount,
        currency: intent.currency,
        status: intent.status,
        expiresAt: intent.expiresAt,
        paidAt: intent.paidAt,
        failedAt: intent.failedAt,
        createdAt: intent.createdAt
      })),
      events: events.map((event) => ({
        provider: event.provider,
        providerEventId: event.providerEventId,
        eventType: event.eventType,
        verificationStatus: event.verificationStatus,
        processingStatus: event.processingStatus,
        failureReason: event.failureReason,
        receivedAt: event.receivedAt,
        processedAt: event.processedAt
      }))
    },
    subscriptions: subscriptionRows,
    subscriptionPeriods: periodRows,
    usage: {
      events: usageEventRows,
      rollups: usageRollupRows
    }
  };
}

export async function deleteAccountForUser(userId: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId)
  });
  if (!user) {
    return null;
  }

  const [job] = await db.insert(accountDeletionJobs).values({
    userId,
    emailDigest: digestEmail(user.email),
    status: "processing",
    startedAt: new Date()
  }).returning();
  if (!job) {
    throw new Error("Failed to create account deletion job.");
  }

  try {
    const documents = await db.query.profileDocuments.findMany({
      where: eq(profileDocuments.userId, userId)
    });
    const deletedFiles = await deleteProfileDocumentFiles(documents.map((document) => document.filePath));

    const deletedRowsSummary = await db.transaction(async (tx) => {
      const deletedSessions = await tx.delete(authSessions).where(eq(authSessions.userId, userId)).returning({ id: authSessions.id });
      const deletedUser = await tx.delete(users).where(eq(users.id, userId)).returning({ id: users.id });
      if (deletedUser.length === 0) {
        throw new Error("User disappeared during account deletion.");
      }

      return {
        authSessions: deletedSessions.length,
        profileDocuments: documents.length
      };
    });

    const [completed] = await db.update(accountDeletionJobs).set({
      status: "completed",
      completedAt: new Date(),
      deletedProfileDocumentFiles: deletedFiles,
      deletedRowsSummary
    }).where(eq(accountDeletionJobs.id, job.id)).returning();

    return completed || job;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown account deletion error";
    await db.update(accountDeletionJobs).set({
      status: "failed",
      failedAt: new Date(),
      failureReason: message
    }).where(eq(accountDeletionJobs.id, job.id));
    throw error;
  }
}

async function deleteProfileDocumentFiles(filePaths: string[]) {
  let deleted = 0;
  for (const filePath of filePaths) {
    if (!filePath || filePath.startsWith("memory://")) {
      continue;
    }
    await unlink(filePath).then(() => {
      deleted += 1;
    }).catch((error: unknown) => {
      const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
      if (code !== "ENOENT") {
        throw error;
      }
    });
  }
  return deleted;
}

function digestEmail(email: string) {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}
