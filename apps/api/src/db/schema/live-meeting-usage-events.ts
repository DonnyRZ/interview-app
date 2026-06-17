import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const liveMeetingUsageEvents = pgTable("live_meeting_usage_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  liveMeetingSessionId: uuid("live_meeting_session_id").notNull(),
  plan: text("plan").notNull(),
  periodStartedAt: timestamp("period_started_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  sessionUnique: uniqueIndex("live_meeting_usage_events_session_unique_idx").on(table.liveMeetingSessionId),
  planCheck: check("live_meeting_usage_events_plan_check", sql`${table.plan} in ('mini', 'starter', 'pro')`)
}));
