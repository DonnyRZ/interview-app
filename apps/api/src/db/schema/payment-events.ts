import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { paymentIntents } from "./payment-intents.js";

export const paymentEvents = pgTable("payment_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  paymentIntentId: uuid("payment_intent_id").references(() => paymentIntents.id, { onDelete: "set null" }),
  provider: text("provider").notNull(),
  providerEventId: text("provider_event_id").notNull(),
  providerTransactionId: text("provider_transaction_id").notNull(),
  eventType: text("event_type").notNull(),
  verificationStatus: text("verification_status").notNull(),
  processingStatus: text("processing_status").notNull().default("received"),
  payloadDigest: text("payload_digest").notNull(),
  sanitizedPayload: jsonb("sanitized_payload").notNull().default({}),
  failureReason: text("failure_reason").notNull().default(""),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true })
}, (table) => ({
  providerEventUnique: uniqueIndex("payment_events_provider_event_unique_idx")
    .on(table.provider, table.providerEventId),
  providerTransactionIndex: index("payment_events_provider_transaction_idx")
    .on(table.provider, table.providerTransactionId),
  paymentIntentIndex: index("payment_events_payment_intent_idx").on(table.paymentIntentId)
}));
