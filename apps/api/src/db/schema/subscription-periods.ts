import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { paymentIntents } from "./payment-intents.js";
import { subscriptions } from "./subscriptions.js";
import { users } from "./users.js";

export const subscriptionPeriods = pgTable("subscription_periods", {
  id: uuid("id").primaryKey().defaultRandom(),
  subscriptionId: uuid("subscription_id").notNull().references(() => subscriptions.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  paymentIntentId: uuid("payment_intent_id").references(() => paymentIntents.id, { onDelete: "set null" }),
  plan: text("plan").notNull(),
  periodStartedAt: timestamp("period_started_at", { withTimezone: true }).notNull(),
  periodEndsAt: timestamp("period_ends_at", { withTimezone: true }).notNull(),
  liveSessionLimit: integer("live_session_limit"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  intentUnique: uniqueIndex("subscription_periods_payment_intent_unique_idx")
    .on(table.paymentIntentId)
    .where(sql`${table.paymentIntentId} is not null`),
  userPeriodIndex: index("subscription_periods_user_period_idx")
    .on(table.userId, table.periodStartedAt),
  planCheck: check("subscription_periods_plan_check", sql`${table.plan} in ('mini', 'starter', 'pro')`),
  statusCheck: check(
    "subscription_periods_status_check",
    sql`${table.status} in ('active', 'completed', 'revoked', 'refunded', 'chargeback')`
  ),
  periodCheck: check(
    "subscription_periods_period_check",
    sql`${table.periodEndsAt} > ${table.periodStartedAt}`
  )
}));
