ALTER TABLE "candidate_cvs" ADD COLUMN "processing_status" text DEFAULT 'ready' NOT NULL;--> statement-breakpoint
ALTER TABLE "candidate_cvs" ADD COLUMN "processing_error" text;