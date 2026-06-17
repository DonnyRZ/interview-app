import { sql } from "drizzle-orm";
import { check, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  orderId: text("order_id").notNull().unique(),
  plan: text("plan").notNull(),
  grossAmount: integer("gross_amount").notNull(),
  currency: text("currency").notNull().default("IDR"),
  status: text("status").notNull().default("created"),
  externalTransactionId: text("external_transaction_id").notNull().default(""),
  customerEmail: text("customer_email").notNull().default(""),
  customerName: text("customer_name").notNull().default(""),
  rawNotification: jsonb("raw_notification").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  externalTransactionUnique: uniqueIndex("payments_external_transaction_id_unique_idx")
    .on(table.externalTransactionId)
    .where(sql`${table.externalTransactionId} <> ''`),
  planCheck: check("payments_plan_check", sql`${table.plan} in ('mini', 'starter', 'pro')`),
  statusCheck: check(
    "payments_status_check",
    sql`${table.status} in ('created', 'pending', 'settlement', 'failure', 'unknown')`
  )
}));
