DO $$ BEGIN
 CREATE TYPE "public"."aml_result" AS ENUM('clear', 'potential_match', 'confirmed_match', 'error');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."audit_event_type" AS ENUM('recipient_registered', 'kyc_initiated', 'kyc_completed', 'debt_linked', 'invite_created', 'invite_opened', 'aml_screened', 'payment_initiated', 'payment_settled', 'payment_failed', 'invite_revoked', 'consumer_duty_outcome_recorded');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."debt_status" AS ENUM('active', 'partially_paid', 'resolved', 'archived');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."invite_status" AS ENUM('active', 'expired', 'revoked', 'fully_paid');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."kyc_status" AS ENUM('pending', 'in_progress', 'approved', 'declined', 'expired');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."payment_status" AS ENUM('initiated', 'pending', 'settled', 'failed', 'refunded');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."privacy_level" AS ENUM('amount_only', 'creditor_name', 'full_balance');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "aml_screenings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" text NOT NULL,
	"subject_name" text NOT NULL,
	"subject_email" text,
	"comply_advantage_id" text,
	"result" "aml_result" NOT NULL,
	"match_count" integer DEFAULT 0 NOT NULL,
	"raw_response" jsonb,
	"reviewed_at" timestamp,
	"reviewed_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" "audit_event_type" NOT NULL,
	"user_id" uuid,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"metadata" jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "debts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"creditor_name" text NOT NULL,
	"creditor_sort_code" text NOT NULL,
	"creditor_account" text NOT NULL,
	"creditor_reference" text,
	"total_amount_pence" integer NOT NULL,
	"paid_amount_pence" integer DEFAULT 0 NOT NULL,
	"status" "debt_status" DEFAULT 'active' NOT NULL,
	"cop_verified" boolean DEFAULT false NOT NULL,
	"cop_verified_at" timestamp,
	"truelayer_account_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"user_id" uuid NOT NULL,
	"debt_id" uuid NOT NULL,
	"privacy_level" "privacy_level" DEFAULT 'amount_only' NOT NULL,
	"personal_message" text,
	"max_amount_pence" integer,
	"expires_at" timestamp NOT NULL,
	"status" "invite_status" DEFAULT 'active' NOT NULL,
	"open_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	"revoked_reason" text,
	CONSTRAINT "invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invite_id" uuid NOT NULL,
	"debt_id" uuid NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"contributor_email" text NOT NULL,
	"contributor_name" text NOT NULL,
	"contributor_ip" text,
	"gross_amount_pence" integer NOT NULL,
	"fee_amount_pence" integer NOT NULL,
	"net_amount_pence" integer NOT NULL,
	"status" "payment_status" DEFAULT 'initiated' NOT NULL,
	"truelayer_payment_id" text,
	"truelayer_auth_uri" text,
	"settled_at" timestamp,
	"aml_screening_id" uuid,
	"consumer_duty_recorded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"kyc_status" "kyc_status" DEFAULT 'pending' NOT NULL,
	"kyc_applicant_id" text,
	"kyc_check_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "debts" ADD CONSTRAINT "debts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invites" ADD CONSTRAINT "invites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invites" ADD CONSTRAINT "invites_debt_id_debts_id_fk" FOREIGN KEY ("debt_id") REFERENCES "public"."debts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_invite_id_invites_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."invites"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_debt_id_debts_id_fk" FOREIGN KEY ("debt_id") REFERENCES "public"."debts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_aml_screening_id_aml_screenings_id_fk" FOREIGN KEY ("aml_screening_id") REFERENCES "public"."aml_screenings"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_user_id_idx" ON "audit_log" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_entity_idx" ON "audit_log" ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_event_type_idx" ON "audit_log" ("event_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_created_at_idx" ON "audit_log" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "debts_user_id_idx" ON "debts" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "invites_token_idx" ON "invites" ("token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invites_user_id_idx" ON "invites" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invites_debt_id_idx" ON "invites" ("debt_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_invite_id_idx" ON "payments" ("invite_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_debt_id_idx" ON "payments" ("debt_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_recipient_user_id_idx" ON "payments" ("recipient_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_truelayer_payment_id_idx" ON "payments" ("truelayer_payment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refresh_tokens_user_id_idx" ON "refresh_tokens" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_idx" ON "users" ("email");