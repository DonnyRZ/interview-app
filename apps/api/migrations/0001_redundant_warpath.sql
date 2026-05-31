CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"order_id" text NOT NULL,
	"plan" text NOT NULL,
	"gross_amount" integer NOT NULL,
	"currency" text DEFAULT 'IDR' NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"snap_token" text DEFAULT '' NOT NULL,
	"snap_redirect_url" text DEFAULT '' NOT NULL,
	"midtrans_transaction_id" text DEFAULT '' NOT NULL,
	"midtrans_order_id" text DEFAULT '' NOT NULL,
	"raw_notification" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "payments_plan_check" CHECK ("payments"."plan" in ('mini', 'starter', 'pro')),
	CONSTRAINT "payments_status_check" CHECK ("payments"."status" in ('created', 'pending', 'capture', 'settlement', 'deny', 'cancel', 'expire', 'failure', 'unknown'))
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "google_sub" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "picture" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "auth_provider" text DEFAULT 'google' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_google_sub_unique" UNIQUE("google_sub");