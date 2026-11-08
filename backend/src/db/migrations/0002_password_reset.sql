-- Password reset: single-use, expiring tokens (hash only) + audit event types.
ALTER TYPE "public"."audit_event_type" ADD VALUE IF NOT EXISTS 'password_reset_requested';--> statement-breakpoint
ALTER TYPE "public"."audit_event_type" ADD VALUE IF NOT EXISTS 'password_reset_completed';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "password_reset_tokens_user_id_idx" ON "password_reset_tokens" ("user_id");
