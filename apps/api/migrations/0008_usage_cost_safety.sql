CREATE TABLE IF NOT EXISTS "usage_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "live_meeting_session_id" uuid REFERENCES "live_meeting_sessions"("id") ON DELETE set null,
  "capability" text NOT NULL,
  "provider" text NOT NULL,
  "model" text NOT NULL,
  "input_tokens" integer DEFAULT 0 NOT NULL,
  "output_tokens" integer DEFAULT 0 NOT NULL,
  "audio_input_tokens" integer DEFAULT 0 NOT NULL,
  "audio_output_tokens" integer DEFAULT 0 NOT NULL,
  "total_tokens" integer DEFAULT 0 NOT NULL,
  "duration_ms" integer DEFAULT 0 NOT NULL,
  "estimated_cost_usd_micros" integer DEFAULT 0 NOT NULL,
  "request_status" text DEFAULT 'success' NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "usage_events_status_check" CHECK ("usage_events"."request_status" in ('success', 'failed', 'blocked'))
);

CREATE INDEX IF NOT EXISTS "usage_events_user_created_idx"
  ON "usage_events" ("user_id", "created_at");

CREATE INDEX IF NOT EXISTS "usage_events_capability_created_idx"
  ON "usage_events" ("capability", "created_at");

CREATE INDEX IF NOT EXISTS "usage_events_live_meeting_session_idx"
  ON "usage_events" ("live_meeting_session_id");

CREATE TABLE IF NOT EXISTS "usage_rollups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "bucket_date" date NOT NULL,
  "capability" text NOT NULL,
  "provider" text NOT NULL,
  "model" text NOT NULL,
  "request_count" integer DEFAULT 0 NOT NULL,
  "input_tokens" integer DEFAULT 0 NOT NULL,
  "output_tokens" integer DEFAULT 0 NOT NULL,
  "audio_input_tokens" integer DEFAULT 0 NOT NULL,
  "audio_output_tokens" integer DEFAULT 0 NOT NULL,
  "total_tokens" integer DEFAULT 0 NOT NULL,
  "estimated_cost_usd_micros" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "usage_rollups_non_negative_check" CHECK (
    "usage_rollups"."request_count" >= 0 and
    "usage_rollups"."input_tokens" >= 0 and
    "usage_rollups"."output_tokens" >= 0 and
    "usage_rollups"."audio_input_tokens" >= 0 and
    "usage_rollups"."audio_output_tokens" >= 0 and
    "usage_rollups"."total_tokens" >= 0 and
    "usage_rollups"."estimated_cost_usd_micros" >= 0
  )
);

CREATE INDEX IF NOT EXISTS "usage_rollups_user_date_idx"
  ON "usage_rollups" ("user_id", "bucket_date");

CREATE UNIQUE INDEX IF NOT EXISTS "usage_rollups_daily_capability_unique_idx"
  ON "usage_rollups" ("user_id", "bucket_date", "capability", "provider", "model");
