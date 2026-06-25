import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const aiProcessingJobs = pgTable("ai_processing_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  jobType: text("job_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  deduplicationKey: text("deduplication_key").notNull(),
  payload: jsonb("payload").notNull().default({}),
  status: text("status").notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  lockedBy: text("locked_by"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true })
}, (table) => ({
  statusAvailableIndex: index("ai_processing_jobs_status_available_idx").on(table.status, table.availableAt),
  entityIndex: index("ai_processing_jobs_entity_idx").on(table.jobType, table.entityId),
  activeDeduplicationUnique: uniqueIndex("ai_processing_jobs_active_deduplication_unique_idx")
    .on(table.deduplicationKey)
    .where(sql`${table.status} in ('queued', 'running')`),
  statusCheck: check(
    "ai_processing_jobs_status_check",
    sql`${table.status} in ('queued', 'running', 'completed', 'failed')`
  ),
  attemptsCheck: check(
    "ai_processing_jobs_attempts_check",
    sql`${table.attempts} >= 0 and ${table.maxAttempts} between 1 and 10`
  )
}));
