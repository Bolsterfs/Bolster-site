-- Make invites.debt_id nullable so invites can be user-level (not debt-specific).
-- Contributors choose which debt to pay when they open the invite link.
ALTER TABLE "invites" ALTER COLUMN "debt_id" DROP NOT NULL;
