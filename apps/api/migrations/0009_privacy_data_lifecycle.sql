CREATE TABLE IF NOT EXISTS "account_deletion_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "email_digest" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "failed_at" timestamp with time zone,
  "deleted_profile_document_files" integer DEFAULT 0 NOT NULL,
  "deleted_rows_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "failure_reason" text DEFAULT '' NOT NULL,
  CONSTRAINT "account_deletion_jobs_status_check" CHECK ("account_deletion_jobs"."status" in ('pending', 'processing', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS "account_deletion_jobs_user_idx"
  ON "account_deletion_jobs" ("user_id");

CREATE INDEX IF NOT EXISTS "account_deletion_jobs_requested_idx"
  ON "account_deletion_jobs" ("requested_at");
