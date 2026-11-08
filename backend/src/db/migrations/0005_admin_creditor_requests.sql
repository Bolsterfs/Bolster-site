-- Audit events written by the admin creditor-request screen.
ALTER TYPE "public"."audit_event_type" ADD VALUE IF NOT EXISTS 'creditor_added';--> statement-breakpoint
ALTER TYPE "public"."audit_event_type" ADD VALUE IF NOT EXISTS 'creditor_request_declined';
