-- Short share codes for invites: /i/<code> instead of a 100-character signed token.
ALTER TABLE "invites" ADD COLUMN IF NOT EXISTS "short_code" text;--> statement-breakpoint
-- Backfill every existing invite with a random 9-character code from an unambiguous
-- alphabet (no 0/O, 1/l/I). Each row's code is derived from a per-row random hash:
-- a plain random subquery is evaluated once and would give every row the same code.
CREATE EXTENSION IF NOT EXISTS pgcrypto;--> statement-breakpoint
UPDATE "invites" i SET "short_code" = sub.code
FROM (
  SELECT id, string_agg(
    substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz',
           (get_byte(digest(id::text || gen_random_uuid()::text, 'sha256'), s) % 57) + 1, 1),
    '' ORDER BY s) AS code
  FROM "invites", generate_series(0, 8) AS s
  GROUP BY id
) sub
WHERE i.id = sub.id AND i."short_code" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "invites_short_code_unique" ON "invites" ("short_code");
