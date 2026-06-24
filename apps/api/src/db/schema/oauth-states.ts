import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const oauthStates = pgTable("oauth_states", {
  id: uuid("id").primaryKey().defaultRandom(),
  stateHash: text("state_hash").notNull().unique(),
  browserBindingHash: text("browser_binding_hash").notNull(),
  plan: text("plan").notNull(),
  flow: text("flow").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  index("oauth_states_expires_at_idx").on(table.expiresAt)
]);
