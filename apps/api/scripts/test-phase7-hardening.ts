import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { buildApp } from "../src/app.js";
import { db } from "../src/db/client.js";
import { aiProcessingJobs, userProfiles, users } from "../src/db/schema/index.js";
import { env } from "../src/env.js";
import {
  claimNextAiProcessingJob,
  enqueueProfileDocumentProcessingJob,
  failAiProcessingJob
} from "../src/modules/jobs/ai-processing-job.service.js";

const migrationSql = await readFile(
  new URL("../migrations/0010_operational_hardening.sql", import.meta.url),
  "utf8"
);
assert.match(migrationSql, /user_profiles_user_id_unique_idx/);
assert.match(migrationSql, /live_meeting_usage_events_live_meeting_session_id_live_meeting_sessions_id_fk/);
assert.match(migrationSql, /ai_processing_jobs/i);
const usageLedgerMigrationSql = await readFile(
  new URL("../migrations/0011_preserve_usage_ledger.sql", import.meta.url),
  "utf8"
);
assert.match(usageLedgerMigrationSql, /ON DELETE set null/i);
const paymentProviderMigrationSql = await readFile(
  new URL("../migrations/0012_payment_provider_abstraction.sql", import.meta.url),
  "utf8"
);
assert.match(paymentProviderMigrationSql, /provider_payment_id/i);
assert.match(paymentProviderMigrationSql, /payment_intents_provider_payment_unique_idx/i);
assert.match(paymentProviderMigrationSql, /payment_intents_pending_expiry_idx/i);

const userId = randomUUID();
const app = buildApp();
await db.insert(users).values({
  id: userId,
  email: `phase7-${userId}@example.test`,
  name: "Phase 7 Test"
});

try {
  await db.insert(userProfiles).values({ userId });
  await assert.rejects(
    db.insert(userProfiles).values({ userId }),
    (error: unknown) => {
      const candidate = error as { cause?: { code?: string; constraint_name?: string } };
      return candidate.cause?.code === "23505"
        && candidate.cause.constraint_name === "user_profiles_user_id_unique_idx";
    }
  );

  const payload = {
    userId,
    profileDocumentId: randomUUID(),
    fileName: "phase7.pdf",
    filePath: "memory://phase7.pdf",
    fileMimeType: "application/pdf"
  };
  await enqueueProfileDocumentProcessingJob(payload);
  await enqueueProfileDocumentProcessingJob(payload);
  const activeJobs = await db.query.aiProcessingJobs.findMany();
  assert.equal(
    activeJobs.filter((job) => job.userId === userId && job.status === "queued").length,
    1,
    "active job deduplication must keep one queued job"
  );
  const claimedJob = await claimNextAiProcessingJob("phase7-test-worker", payload.profileDocumentId);
  assert.equal(claimedJob?.userId, userId);
  assert.equal(claimedJob?.attempts, 1);
  await failAiProcessingJob(claimedJob!, new Error("simulated retryable failure"));
  const retriedJob = await db.query.aiProcessingJobs.findFirst({
    where: eq(aiProcessingJobs.id, claimedJob!.id)
  });
  assert.equal(retriedJob?.status, "queued");
  assert.match(retriedJob?.lastError || "", /simulated retryable failure/);

  const health = await app.inject({ method: "GET", url: "/health" });
  assert.equal(health.statusCode, 200);
  assert.equal(health.headers["x-content-type-options"], "nosniff");
  assert.equal(health.headers["x-frame-options"], "DENY");

  const readiness = await app.inject({ method: "GET", url: "/ready" });
  assert.equal(readiness.statusCode, 200);
  assert.equal(readiness.json().checks.database.ok, true);
  assert.equal(readiness.json().checks.storage.ok, true);

  const hiddenMetrics = await app.inject({ method: "GET", url: "/internal/metrics" });
  assert.equal(hiddenMetrics.statusCode, 404);
  if (env.OPERATIONS_TOKEN) {
    const metrics = await app.inject({
      method: "GET",
      url: "/internal/metrics",
      headers: {
        authorization: `Bearer ${env.OPERATIONS_TOKEN}`
      }
    });
    assert.equal(metrics.statusCode, 200);
    assert.equal(typeof metrics.json().queuedJobs, "number");
  }
} finally {
  await db.delete(aiProcessingJobs).where(eq(aiProcessingJobs.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
  await app.close();
}

console.info("Phase 7 operational hardening contracts passed.");
