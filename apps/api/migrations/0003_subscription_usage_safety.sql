ALTER TABLE "users" ADD COLUMN "subscription_period_started_at" timestamp with time zone;--> statement-breakpoint
CREATE TABLE "live_meeting_usage_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "live_meeting_session_id" uuid NOT NULL,
  "plan" text NOT NULL,
  "period_started_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "live_meeting_usage_events_plan_check" CHECK ("live_meeting_usage_events"."plan" in ('mini', 'starter', 'pro'))
);--> statement-breakpoint
ALTER TABLE "live_meeting_usage_events" ADD CONSTRAINT "live_meeting_usage_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "live_meeting_usage_events_session_unique_idx" ON "live_meeting_usage_events" USING btree ("live_meeting_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_external_transaction_id_unique_idx" ON "payments" USING btree ("provider","external_transaction_id") WHERE "payments"."external_transaction_id" <> '';--> statement-breakpoint
UPDATE "users"
SET "subscription_period_started_at" = "subscription_expires_at" - interval '30 days'
WHERE "subscription_plan" <> 'free'
  AND "subscription_expires_at" IS NOT NULL
  AND "subscription_period_started_at" IS NULL;--> statement-breakpoint
INSERT INTO "live_meeting_usage_events" ("user_id", "live_meeting_session_id", "plan", "period_started_at", "created_at")
SELECT "live_meeting_sessions"."user_id",
       "live_meeting_sessions"."id",
       "users"."subscription_plan",
       "users"."subscription_period_started_at",
       "live_meeting_sessions"."created_at"
FROM "live_meeting_sessions"
INNER JOIN "users" ON "users"."id" = "live_meeting_sessions"."user_id"
WHERE "users"."subscription_plan" in ('mini', 'starter', 'pro')
  AND "users"."subscription_period_started_at" IS NOT NULL
  AND "users"."subscription_expires_at" IS NOT NULL
  AND "live_meeting_sessions"."created_at" >= "users"."subscription_period_started_at"
  AND "live_meeting_sessions"."created_at" < "users"."subscription_expires_at"
ON CONFLICT ("live_meeting_session_id") DO NOTHING;
