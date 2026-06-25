import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { liveMeetingSessions } from "./live-meeting-sessions.js";
import { users } from "./users.js";

export const usageEvents = pgTable("usage_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  liveMeetingSessionId: uuid("live_meeting_session_id").references(() => liveMeetingSessions.id, { onDelete: "set null" }),
  capability: text("capability").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  audioInputTokens: integer("audio_input_tokens").notNull().default(0),
  audioOutputTokens: integer("audio_output_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  durationMs: integer("duration_ms").notNull().default(0),
  estimatedCostUsdMicros: integer("estimated_cost_usd_micros").notNull().default(0),
  requestStatus: text("request_status").notNull().default("success"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  userCreatedIndex: index("usage_events_user_created_idx").on(table.userId, table.createdAt),
  capabilityCreatedIndex: index("usage_events_capability_created_idx").on(table.capability, table.createdAt),
  liveMeetingSessionIndex: index("usage_events_live_meeting_session_idx").on(table.liveMeetingSessionId),
  statusCheck: check("usage_events_status_check", sql`${table.requestStatus} in ('success', 'failed', 'blocked')`)
}));
