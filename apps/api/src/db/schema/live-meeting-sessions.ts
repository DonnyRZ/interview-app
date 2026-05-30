import { sql } from "drizzle-orm";
import { check, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { meetingContexts } from "./meeting-contexts.js";
import { users } from "./users.js";

export const liveMeetingSessions = pgTable("live_meeting_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  meetingContextId: uuid("meeting_context_id").notNull().references(() => meetingContexts.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sessionType: text("session_type").notNull(),
  languageDetected: text("language_detected"),
  transcriptText: text("transcript_text"),
  summaryJson: jsonb("summary_json"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  sessionTypeCheck: check(
    "live_meeting_sessions_session_type_check",
    sql`${table.sessionType} in ('HR', 'TECHNICAL', 'USER', 'FINAL', 'OTHER')`
  )
}));
