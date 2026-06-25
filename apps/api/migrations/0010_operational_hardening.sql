DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "user_profiles"
    GROUP BY "user_id"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add user_profiles.user_id uniqueness: duplicate profiles exist';
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_profiles_user_id_unique_idx"
  ON "user_profiles" ("user_id");
--> statement-breakpoint
DELETE FROM "live_meeting_usage_events" usage
WHERE NOT EXISTS (
  SELECT 1
  FROM "live_meeting_sessions" session
  WHERE session."id" = usage."live_meeting_session_id"
);
--> statement-breakpoint
ALTER TABLE "live_meeting_usage_events"
  ADD CONSTRAINT "live_meeting_usage_events_live_meeting_session_id_live_meeting_sessions_id_fk"
  FOREIGN KEY ("live_meeting_session_id")
  REFERENCES "public"."live_meeting_sessions"("id")
  ON DELETE cascade
  ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "ai_processing_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "job_type" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "deduplication_key" text NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 3 NOT NULL,
  "available_at" timestamp with time zone DEFAULT now() NOT NULL,
  "locked_at" timestamp with time zone,
  "locked_by" text,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  CONSTRAINT "ai_processing_jobs_status_check"
    CHECK ("status" in ('queued', 'running', 'completed', 'failed')),
  CONSTRAINT "ai_processing_jobs_attempts_check"
    CHECK ("attempts" >= 0 and "max_attempts" between 1 and 10)
);
--> statement-breakpoint
ALTER TABLE "ai_processing_jobs"
  ADD CONSTRAINT "ai_processing_jobs_user_id_users_id_fk"
  FOREIGN KEY ("user_id")
  REFERENCES "public"."users"("id")
  ON DELETE cascade
  ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "ai_processing_jobs_status_available_idx"
  ON "ai_processing_jobs" ("status", "available_at");
--> statement-breakpoint
CREATE INDEX "ai_processing_jobs_entity_idx"
  ON "ai_processing_jobs" ("job_type", "entity_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_processing_jobs_active_deduplication_unique_idx"
  ON "ai_processing_jobs" ("deduplication_key")
  WHERE "status" in ('queued', 'running');
