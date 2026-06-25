CREATE TABLE "payment_intents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "public_id" text NOT NULL,
  "user_id" uuid NOT NULL,
  "provider" text DEFAULT 'lynk' NOT NULL,
  "provider_order_id" text NOT NULL,
  "provider_product_id" text NOT NULL,
  "plan" text NOT NULL,
  "amount" integer NOT NULL,
  "currency" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "customer_email" text NOT NULL,
  "checkout_url" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "paid_at" timestamp with time zone,
  "failed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "payment_intents_plan_check" CHECK ("plan" in ('mini', 'starter', 'pro')),
  CONSTRAINT "payment_intents_amount_check" CHECK ("amount" >= 0),
  CONSTRAINT "payment_intents_currency_check" CHECK ("currency" = upper("currency") and char_length("currency") = 3),
  CONSTRAINT "payment_intents_status_check" CHECK ("status" in ('pending', 'paid', 'failed', 'expired', 'refunded', 'chargeback'))
);
--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "payment_intents_public_id_unique_idx" ON "payment_intents" USING btree ("public_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "payment_intents_provider_order_unique_idx" ON "payment_intents" USING btree ("provider","provider_order_id");
--> statement-breakpoint
CREATE INDEX "payment_intents_user_created_idx" ON "payment_intents" USING btree ("user_id","created_at");
--> statement-breakpoint

CREATE TABLE "subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "plan" text NOT NULL,
  "status" text NOT NULL,
  "source_payment_intent_id" uuid,
  "current_period_started_at" timestamp with time zone NOT NULL,
  "current_period_ends_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "revoke_reason" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "subscriptions_plan_check" CHECK ("plan" in ('mini', 'starter', 'pro')),
  CONSTRAINT "subscriptions_status_check" CHECK ("status" in ('active', 'expired', 'revoked', 'refunded', 'chargeback')),
  CONSTRAINT "subscriptions_period_check" CHECK ("current_period_ends_at" > "current_period_started_at")
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_source_payment_intent_id_payment_intents_id_fk"
  FOREIGN KEY ("source_payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_one_current_per_user_idx" ON "subscriptions" USING btree ("user_id") WHERE "subscriptions"."status" = 'active';
--> statement-breakpoint
CREATE INDEX "subscriptions_user_idx" ON "subscriptions" USING btree ("user_id");
--> statement-breakpoint

CREATE TABLE "subscription_periods" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "subscription_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "payment_intent_id" uuid,
  "plan" text NOT NULL,
  "period_started_at" timestamp with time zone NOT NULL,
  "period_ends_at" timestamp with time zone NOT NULL,
  "live_session_limit" integer,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "subscription_periods_plan_check" CHECK ("plan" in ('mini', 'starter', 'pro')),
  CONSTRAINT "subscription_periods_status_check" CHECK ("status" in ('active', 'completed', 'revoked', 'refunded', 'chargeback')),
  CONSTRAINT "subscription_periods_period_check" CHECK ("period_ends_at" > "period_started_at")
);
--> statement-breakpoint
ALTER TABLE "subscription_periods" ADD CONSTRAINT "subscription_periods_subscription_id_subscriptions_id_fk"
  FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "subscription_periods" ADD CONSTRAINT "subscription_periods_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "subscription_periods" ADD CONSTRAINT "subscription_periods_payment_intent_id_payment_intents_id_fk"
  FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_periods_payment_intent_unique_idx" ON "subscription_periods" USING btree ("payment_intent_id") WHERE "subscription_periods"."payment_intent_id" is not null;
--> statement-breakpoint
CREATE INDEX "subscription_periods_user_period_idx" ON "subscription_periods" USING btree ("user_id","period_started_at");
--> statement-breakpoint

CREATE TABLE "payment_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "payment_intent_id" uuid,
  "provider" text NOT NULL,
  "provider_event_id" text NOT NULL,
  "provider_transaction_id" text NOT NULL,
  "event_type" text NOT NULL,
  "verification_status" text NOT NULL,
  "processing_status" text DEFAULT 'received' NOT NULL,
  "payload_digest" text NOT NULL,
  "sanitized_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "failure_reason" text DEFAULT '' NOT NULL,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL,
  "processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_intent_id_payment_intents_id_fk"
  FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_provider_event_unique_idx" ON "payment_events" USING btree ("provider","provider_event_id");
--> statement-breakpoint
CREATE INDEX "payment_events_provider_transaction_idx" ON "payment_events" USING btree ("provider","provider_transaction_id");
--> statement-breakpoint
CREATE INDEX "payment_events_payment_intent_idx" ON "payment_events" USING btree ("payment_intent_id");
--> statement-breakpoint

INSERT INTO "subscriptions" (
  "user_id", "plan", "status", "current_period_started_at", "current_period_ends_at"
)
SELECT
  "id",
  "subscription_plan",
  'active',
  COALESCE("subscription_period_started_at", now()),
  "subscription_expires_at"
FROM "users"
WHERE "subscription_plan" in ('mini', 'starter', 'pro')
  AND "subscription_expires_at" > now();
--> statement-breakpoint

INSERT INTO "subscription_periods" (
  "subscription_id", "user_id", "plan", "period_started_at", "period_ends_at", "live_session_limit", "status"
)
SELECT
  s."id",
  s."user_id",
  s."plan",
  s."current_period_started_at",
  s."current_period_ends_at",
  CASE s."plan" WHEN 'mini' THEN 3 WHEN 'starter' THEN 12 ELSE NULL END,
  'active'
FROM "subscriptions" s
WHERE s."status" = 'active';
