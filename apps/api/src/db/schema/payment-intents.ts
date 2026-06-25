import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const paymentIntents = pgTable("payment_intents", {
  id: uuid("id").primaryKey().defaultRandom(),
  publicId: text("public_id").notNull(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("lynk"),
  providerOrderId: text("provider_order_id").notNull(),
  providerProductId: text("provider_product_id").notNull(),
  plan: text("plan").notNull(),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull(),
  status: text("status").notNull().default("pending"),
  customerEmail: text("customer_email").notNull(),
  checkoutUrl: text("checkout_url").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  failedAt: timestamp("failed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  publicIdUnique: uniqueIndex("payment_intents_public_id_unique_idx").on(table.publicId),
  providerOrderUnique: uniqueIndex("payment_intents_provider_order_unique_idx")
    .on(table.provider, table.providerOrderId),
  userCreatedIndex: index("payment_intents_user_created_idx").on(table.userId, table.createdAt),
  planCheck: check("payment_intents_plan_check", sql`${table.plan} in ('mini', 'starter', 'pro')`),
  amountCheck: check("payment_intents_amount_check", sql`${table.amount} >= 0`),
  currencyCheck: check("payment_intents_currency_check", sql`${table.currency} = upper(${table.currency}) and char_length(${table.currency}) = 3`),
  statusCheck: check(
    "payment_intents_status_check",
    sql`${table.status} in ('pending', 'paid', 'failed', 'expired', 'refunded', 'chargeback')`
  )
}));
