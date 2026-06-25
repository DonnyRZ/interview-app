ALTER TABLE "live_meeting_usage_events"
  DROP CONSTRAINT IF EXISTS "live_meeting_usage_events_live_meeting_session_id_live_meeting_";
--> statement-breakpoint
ALTER TABLE "live_meeting_usage_events"
  ALTER COLUMN "live_meeting_session_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "live_meeting_usage_events"
  ADD CONSTRAINT "live_meeting_usage_session_fk"
  FOREIGN KEY ("live_meeting_session_id")
  REFERENCES "public"."live_meeting_sessions"("id")
  ON DELETE set null
  ON UPDATE no action;
