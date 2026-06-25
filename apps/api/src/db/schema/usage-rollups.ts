import { sql } from "drizzle-orm";
import { check, date, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const usageRollups = pgTable("usage_rollups", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  bucketDate: date("bucket_date").notNull(),
  capability: text("capability").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  requestCount: integer("request_count").notNull().default(0),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  audioInputTokens: integer("audio_input_tokens").notNull().default(0),
  audioOutputTokens: integer("audio_output_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  estimatedCostUsdMicros: integer("estimated_cost_usd_micros").notNull().default(0)
}, (table) => ({
  userDateIndex: index("usage_rollups_user_date_idx").on(table.userId, table.bucketDate),
  uniqueDailyCapability: uniqueIndex("usage_rollups_daily_capability_unique_idx")
    .on(table.userId, table.bucketDate, table.capability, table.provider, table.model),
  nonNegativeCheck: check("usage_rollups_non_negative_check", sql`
    ${table.requestCount} >= 0 and
    ${table.inputTokens} >= 0 and
    ${table.outputTokens} >= 0 and
    ${table.audioInputTokens} >= 0 and
    ${table.audioOutputTokens} >= 0 and
    ${table.totalTokens} >= 0 and
    ${table.estimatedCostUsdMicros} >= 0
  `)
}));
