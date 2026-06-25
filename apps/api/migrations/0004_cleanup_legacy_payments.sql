UPDATE "payments"
SET "external_transaction_id" = ''
WHERE "provider" <> 'lynk'
  AND "external_transaction_id" <> '';--> statement-breakpoint
UPDATE "payments"
SET "status" = 'settlement'
WHERE "status" = 'capture';--> statement-breakpoint
UPDATE "payments"
SET "status" = 'failure'
WHERE "status" in ('deny', 'cancel', 'expire');--> statement-breakpoint
DROP INDEX IF EXISTS "payments_provider_external_transaction_id_unique_idx";--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_provider_check";--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_status_check";--> statement-breakpoint
ALTER TABLE "payments" DROP COLUMN IF EXISTS "provider";--> statement-breakpoint
ALTER TABLE "payments" DROP COLUMN IF EXISTS "snap_token";--> statement-breakpoint
ALTER TABLE "payments" DROP COLUMN IF EXISTS "snap_redirect_url";--> statement-breakpoint
ALTER TABLE "payments" DROP COLUMN IF EXISTS "midtrans_transaction_id";--> statement-breakpoint
ALTER TABLE "payments" DROP COLUMN IF EXISTS "midtrans_order_id";--> statement-breakpoint
CREATE UNIQUE INDEX "payments_external_transaction_id_unique_idx" ON "payments" USING btree ("external_transaction_id") WHERE "payments"."external_transaction_id" <> '';--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_status_check" CHECK ("payments"."status" in ('created', 'pending', 'settlement', 'failure', 'unknown'));
