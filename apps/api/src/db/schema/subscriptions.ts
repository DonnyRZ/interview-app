import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { paymentIntents } from "./payment-intents.js";
import { users } from "./users.js";

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  plan: text("plan").notNull(),
  status: text("status").notNull(),
  sourcePaymentIntentId: uuid("source_payment_intent_id").references(() => paymentIntents.id, { onDelete: "set null" }),
  currentPeriodStartedAt: timestamp("current_period_started_at", { withTimezone: true }).notNull(),
  currentPeriodEndsAt: timestamp("current_period_ends_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokeReason: text("revoke_reason").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  activeUserUnique: uniqueIndex("subscriptions_one_current_per_user_idx")
    .on(table.userId)
    .where(sql`${table.status} = 'active'`),
  userIndex: index("subscriptions_user_idx").on(table.userId),
  planCheck: check("subscriptions_plan_check", sql`${table.plan} in ('mini', 'starter', 'pro')`),
  statusCheck: check(
    "subscriptions_status_check",
    sql`${table.status} in ('active', 'expired', 'revoked', 'refunded', 'chargeback')`
  ),
  periodCheck: check(
    "subscriptions_period_check",
    sql`${table.currentPeriodEndsAt} > ${table.currentPeriodStartedAt}`
  )
}));
