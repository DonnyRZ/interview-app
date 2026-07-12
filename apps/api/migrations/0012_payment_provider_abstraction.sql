ALTER TABLE "payment_intents"
  ADD COLUMN "provider_payment_id" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "payment_intents_provider_payment_unique_idx"
  ON "payment_intents" ("provider", "provider_payment_id")
  WHERE "provider_payment_id" is not null;
--> statement-breakpoint
CREATE INDEX "payment_intents_pending_expiry_idx"
  ON "payment_intents" ("expires_at")
  WHERE "status" = 'pending';
