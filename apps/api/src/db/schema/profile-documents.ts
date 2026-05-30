import { sql } from "drizzle-orm";
import { boolean, check, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const profileDocuments = pgTable("profile_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  filePath: text("file_path").notNull(),
  fileMimeType: text("file_mime_type"),
  summaryJson: jsonb("summary_json"),
  readyContext: text("ready_context"),
  processingStatus: text("processing_status").notNull().default("ready"),
  processingError: text("processing_error"),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  oneActiveProfileDocumentPerUser: uniqueIndex("profile_documents_one_active_per_user_idx")
    .on(table.userId)
    .where(sql`${table.isActive} = true`),
  processingStatusCheck: check(
    "profile_documents_processing_status_check",
    sql`${table.processingStatus} in ('uploaded', 'processing', 'ready', 'failed')`
  )
}));
