import { sql } from "drizzle-orm";
import { check, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { profileDocuments } from "./profile-documents.js";
import { users } from "./users.js";

export const meetingContexts = pgTable("meeting_contexts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  profileDocumentId: uuid("profile_document_id").notNull().references(() => profileDocuments.id, { onDelete: "restrict" }),
  contextName: text("context_name").notNull(),
  meetingTopic: text("meeting_topic").notNull(),
  meetingBrief: text("meeting_brief"),
  meetingSummaryJson: jsonb("meeting_summary_json"),
  meetingContextText: text("meeting_context_text"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  statusCheck: check(
    "meeting_contexts_status_check",
    sql`${table.status} in ('active', 'archived')`
  )
}));
