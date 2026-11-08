ALTER TYPE "public"."payment_status" ADD VALUE IF NOT EXISTS 'expired';--> statement-breakpoint
-- Store the Stripe Checkout session so a missed webhook can be reconciled.
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "stripe_session_id" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "last_reconciled_at" timestamp;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_stripe_session_id_idx" ON "payments" USING btree ("stripe_session_id");
