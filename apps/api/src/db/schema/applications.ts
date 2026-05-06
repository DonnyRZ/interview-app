import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { candidateCvs } from "./candidate-cvs.js";
import { users } from "./users.js";

export const applications = pgTable("applications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  cvId: uuid("cv_id").notNull().references(() => candidateCvs.id, { onDelete: "restrict" }),
  companyName: text("company_name").notNull(),
  roleTitle: text("role_title").notNull(),
  jobDescription: text("job_description"),
  jobSummaryJson: jsonb("job_summary_json"),
  companyContext: text("company_context"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
