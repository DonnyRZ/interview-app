import { boolean, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const candidateCvs = pgTable("candidate_cvs", {
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
});
