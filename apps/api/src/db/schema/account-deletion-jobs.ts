import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const accountDeletionJobs = pgTable("account_deletion_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  emailDigest: text("email_digest").notNull(),
  status: text("status").notNull().default("pending"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  failedAt: timestamp("failed_at", { withTimezone: true }),
  deletedProfileDocumentFiles: integer("deleted_profile_document_files").notNull().default(0),
  deletedRowsSummary: jsonb("deleted_rows_summary").notNull().default({}),
  failureReason: text("failure_reason").notNull().default("")
}, (table) => ({
  userIndex: index("account_deletion_jobs_user_idx").on(table.userId),
  requestedIndex: index("account_deletion_jobs_requested_idx").on(table.requestedAt),
  statusCheck: check("account_deletion_jobs_status_check", sql`${table.status} in ('pending', 'processing', 'completed', 'failed')`)
}));
