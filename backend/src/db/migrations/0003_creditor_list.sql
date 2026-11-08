-- Vetted creditor list: recipients pick a creditor instead of typing bank details.
ALTER TYPE "public"."audit_event_type" ADD VALUE IF NOT EXISTS 'creditor_requested';--> statement-breakpoint
ALTER TYPE "public"."audit_event_type" ADD VALUE IF NOT EXISTS 'bill_scanned';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "creditors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_code" text NOT NULL,
	"account_number" text NOT NULL,
	"reference_label" text DEFAULT 'Customer reference' NOT NULL,
	"reference_hint" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_test_data" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp NOT NULL,
	"verified_by" text NOT NULL,
	"verification_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "creditors_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "creditor_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"creditor_name" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN IF NOT EXISTS "creditor_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "creditor_requests" ADD CONSTRAINT "creditor_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "debts" ADD CONSTRAINT "debts_creditor_id_creditors_id_fk" FOREIGN KEY ("creditor_id") REFERENCES "public"."creditors"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creditor_requests_user_id_idx" ON "creditor_requests" ("user_id");
