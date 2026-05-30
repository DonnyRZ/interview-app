CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"active_profile_document_id" uuid,
	"default_answer_language" text DEFAULT 'auto' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"file_path" text NOT NULL,
	"file_mime_type" text,
	"summary_json" jsonb,
	"ready_context" text,
	"processing_status" text DEFAULT 'ready' NOT NULL,
	"processing_error" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_documents_processing_status_check" CHECK ("profile_documents"."processing_status" in ('uploaded', 'processing', 'ready', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "meeting_contexts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"profile_document_id" uuid NOT NULL,
	"context_name" text NOT NULL,
	"meeting_topic" text NOT NULL,
	"meeting_brief" text,
	"meeting_summary_json" jsonb,
	"meeting_context_text" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_contexts_status_check" CHECK ("meeting_contexts"."status" in ('active', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "live_meeting_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_context_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"session_type" text NOT NULL,
	"language_detected" text,
	"transcript_text" text,
	"summary_json" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "live_meeting_sessions_session_type_check" CHECK ("live_meeting_sessions"."session_type" in ('HR', 'TECHNICAL', 'USER', 'FINAL', 'OTHER'))
);
--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_documents" ADD CONSTRAINT "profile_documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_contexts" ADD CONSTRAINT "meeting_contexts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_contexts" ADD CONSTRAINT "meeting_contexts_profile_document_id_profile_documents_id_fk" FOREIGN KEY ("profile_document_id") REFERENCES "public"."profile_documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_meeting_sessions" ADD CONSTRAINT "live_meeting_sessions_meeting_context_id_meeting_contexts_id_fk" FOREIGN KEY ("meeting_context_id") REFERENCES "public"."meeting_contexts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_meeting_sessions" ADD CONSTRAINT "live_meeting_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "profile_documents_one_active_per_user_idx" ON "profile_documents" USING btree ("user_id") WHERE "profile_documents"."is_active" = true;