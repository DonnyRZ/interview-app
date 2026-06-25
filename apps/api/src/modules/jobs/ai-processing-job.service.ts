import { randomUUID } from "node:crypto";
import { db, sql } from "../../db/client.js";
import { aiProcessingJobs } from "../../db/schema/index.js";

export type ProfileDocumentProcessingPayload = {
  userId: string;
  profileDocumentId: string;
  fileName: string;
  filePath: string;
  fileMimeType?: string | null;
};

export type ClaimedAiProcessingJob = {
  id: string;
  userId: string;
  jobType: "profile_document_preprocessing";
  entityId: string;
  payload: ProfileDocumentProcessingPayload;
  attempts: number;
  maxAttempts: number;
};

export async function enqueueProfileDocumentProcessingJob(input: ProfileDocumentProcessingPayload) {
  const [createdJob] = await db.insert(aiProcessingJobs)
    .values({
      userId: input.userId,
      jobType: "profile_document_preprocessing",
      entityId: input.profileDocumentId,
      deduplicationKey: `profile_document_preprocessing:${input.profileDocumentId}`,
      payload: input,
      status: "queued"
    })
    .onConflictDoNothing()
    .returning();

  return createdJob || null;
}

export async function claimNextAiProcessingJob(
  workerId = `worker-${randomUUID()}`,
  entityId?: string
) {
  return sql.begin(async (transaction) => {
    await transaction`
      UPDATE "ai_processing_jobs"
      SET
        "status" = 'queued',
        "locked_at" = NULL,
        "locked_by" = NULL,
        "available_at" = now(),
        "updated_at" = now()
      WHERE "status" = 'running'
        AND "locked_at" < now() - interval '15 minutes'
    `;

    const rows = await transaction<ClaimedAiProcessingJob[]>`
      WITH candidate AS (
        SELECT "id"
        FROM "ai_processing_jobs"
        WHERE "status" = 'queued'
          AND "available_at" <= now()
          AND "attempts" < "max_attempts"
          AND (${entityId || null}::uuid IS NULL OR "entity_id" = ${entityId || null}::uuid)
        ORDER BY "created_at" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE "ai_processing_jobs" job
      SET
        "status" = 'running',
        "attempts" = job."attempts" + 1,
        "locked_at" = now(),
        "locked_by" = ${workerId},
        "updated_at" = now()
      FROM candidate
      WHERE job."id" = candidate."id"
      RETURNING
        job."id",
        job."user_id" AS "userId",
        job."job_type" AS "jobType",
        job."entity_id" AS "entityId",
        job."payload",
        job."attempts",
        job."max_attempts" AS "maxAttempts"
    `;

    return rows[0] || null;
  });
}

export async function completeAiProcessingJob(jobId: string) {
  await sql`
    UPDATE "ai_processing_jobs"
    SET
      "status" = 'completed',
      "completed_at" = now(),
      "locked_at" = NULL,
      "locked_by" = NULL,
      "last_error" = NULL,
      "updated_at" = now()
    WHERE "id" = ${jobId}
  `;
}

export async function failAiProcessingJob(
  job: Pick<ClaimedAiProcessingJob, "id" | "attempts" | "maxAttempts">,
  error: unknown
) {
  const errorMessage = sanitizeJobError(error);
  const shouldRetry = job.attempts < job.maxAttempts;
  const retryDelaySeconds = Math.min(300, 5 * (2 ** Math.max(0, job.attempts - 1)));

  await sql`
    UPDATE "ai_processing_jobs"
    SET
      "status" = ${shouldRetry ? "queued" : "failed"},
      "available_at" = CASE
        WHEN ${shouldRetry} THEN now() + (${retryDelaySeconds} * interval '1 second')
        ELSE "available_at"
      END,
      "locked_at" = NULL,
      "locked_by" = NULL,
      "last_error" = ${errorMessage},
      "updated_at" = now()
    WHERE "id" = ${job.id}
  `;
}

export async function cancelAiProcessingJobsForEntity(jobType: string, entityId: string) {
  await sql`
    UPDATE "ai_processing_jobs"
    SET
      "status" = 'failed',
      "last_error" = 'Entity deleted before processing completed',
      "locked_at" = NULL,
      "locked_by" = NULL,
      "updated_at" = now()
    WHERE "job_type" = ${jobType}
      AND "entity_id" = ${entityId}
      AND "status" in ('queued', 'running')
  `;
}

function sanitizeJobError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown AI processing error";
  return message.replace(/\s+/g, " ").trim().slice(0, 1000);
}
