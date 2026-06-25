import { readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { and, eq, isNotNull, lt } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  accountDeletionJobs,
  liveMeetingSessions,
  paymentEvents,
  profileDocuments
} from "../../db/schema/index.js";
import { env } from "../../env.js";
import { profileDocumentStorageDir } from "../../lib/storage.js";
import { deleteExpiredAuthArtifacts } from "../auth/session.js";

export async function runPrivacyCleanup(now = new Date()) {
  const auth = await deleteExpiredAuthArtifacts(now);
  const transcriptCutoff = daysAgo(now, env.LIVE_TRANSCRIPT_RETENTION_DAYS);
  const deletionJobCutoff = daysAgo(now, env.ACCOUNT_DELETION_JOB_RETENTION_DAYS);
  const paymentEventCutoff = daysAgo(now, env.PAYMENT_EVENT_RETENTION_DAYS);

  const scrubbedTranscripts = await db.update(liveMeetingSessions).set({
    transcriptText: null,
    summaryJson: null
  }).where(and(
    isNotNull(liveMeetingSessions.endedAt),
    lt(liveMeetingSessions.endedAt, transcriptCutoff)
  )).returning({ id: liveMeetingSessions.id });

  const removedDeletionJobs = await db.delete(accountDeletionJobs)
    .where(and(
      eq(accountDeletionJobs.status, "completed"),
      lt(accountDeletionJobs.completedAt, deletionJobCutoff)
    ))
    .returning({ id: accountDeletionJobs.id });

  const removedPaymentEvents = await db.delete(paymentEvents)
    .where(lt(paymentEvents.receivedAt, paymentEventCutoff))
    .returning({ id: paymentEvents.id });

  const orphanFiles = await deleteOrphanProfileDocumentFiles();

  return {
    auth,
    scrubbedLiveMeetingTranscripts: scrubbedTranscripts.length,
    removedPaymentEvents: removedPaymentEvents.length,
    removedDeletionJobs: removedDeletionJobs.length,
    orphanProfileDocumentFiles: orphanFiles
  };
}

async function deleteOrphanProfileDocumentFiles() {
  const files = await readdir(profileDocumentStorageDir).catch(() => []);
  if (files.length === 0) {
    return 0;
  }

  const storedDocuments = await db.select({ filePath: profileDocuments.filePath }).from(profileDocuments);
  const referenced = new Set(storedDocuments.map((document) => path.resolve(document.filePath)));
  const candidates = files
    .filter((fileName) => fileName !== ".gitkeep")
    .map((fileName) => path.join(profileDocumentStorageDir, fileName));

  const unreferenced = candidates.filter((filePath) => !referenced.has(path.resolve(filePath)));
  if (unreferenced.length === 0) {
    return 0;
  }

  let deleted = 0;
  for (const filePath of unreferenced) {
    const fileStats = await stat(filePath).catch(() => null);
    if (!fileStats?.isFile()) {
      continue;
    }
    await unlink(filePath);
    deleted += 1;
  }
  return deleted;
}

function daysAgo(now: Date, days: number) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}
