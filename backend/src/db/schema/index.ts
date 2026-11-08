import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  pgEnum,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

// ─── Enums ────────────────────────────────────────────────────────────────────

export const kycStatusEnum = pgEnum('kyc_status', [
  'pending',
  'in_progress',
  'approved',
  'declined',
  'expired',
])

export const debtStatusEnum = pgEnum('debt_status', [
  'active',
  'partially_paid',
  'resolved',
  'archived',
])

export const inviteStatusEnum = pgEnum('invite_status', [
  'active',
  'expired',
  'revoked',
  'fully_paid',
])

export const paymentStatusEnum = pgEnum('payment_status', [
  'initiated',
  'pending',
  'settled',
  'failed',
  'refunded',
  'expired',   // card checkout abandoned and timed out — never charged
])

export const privacyLevelEnum = pgEnum('privacy_level', [
  'amount_only',      // contributor sees amount owed but not creditor
  'creditor_name',    // contributor sees creditor name + amount
  'full_balance',     // contributor sees full debt balance
])

export const amlResultEnum = pgEnum('aml_result', [
  'clear',
  'potential_match',
  'confirmed_match',
  'error',
])

export const auditEventTypeEnum = pgEnum('audit_event_type', [
  'recipient_registered',
  'kyc_initiated',
  'kyc_completed',
  'debt_linked',
  'invite_created',
  'invite_opened',
  'aml_screened',
  'payment_initiated',
  'payment_settled',
  'payment_failed',
  'invite_revoked',
  'consumer_duty_outcome_recorded',
  'password_reset_requested',
  'password_reset_completed',
  'creditor_requested',
  'bill_scanned',
])

// ─── Users (recipients) ───────────────────────────────────────────────────────

export const users = pgTable('users', {
  id:           uuid('id').primaryKey().defaultRandom(),
  email:        text('email').notNull().unique(),
  phone:        text('phone'),
  firstName:    text('first_name').notNull(),
  lastName:     text('last_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  kycStatus:    kycStatusEnum('kyc_status').notNull().default('pending'),
  kycApplicantId: text('kyc_applicant_id'),    // Veriff session ID
  kycCheckId:   text('kyc_check_id'),           // Veriff verification ID
  isActive:     boolean('is_active').notNull().default(true),
  createdAt:    timestamp('created_at').notNull().defaultNow(),
  updatedAt:    timestamp('updated_at').notNull().defaultNow(),
  deletedAt:    timestamp('deleted_at'),        // soft delete — never hard delete
}, (t) => ({
  emailIdx: uniqueIndex('users_email_idx').on(t.email),
}))

// ─── Creditors — Bolster's vetted list ───────────────────────────────────────
// Payment details for a creditor come ONLY from this table. Recipients pick a
// creditor from the list; they never type a sort code or account number, so a
// payment cannot be redirected by entering (or scanning) false bank details.
// Every row records who at Bolster verified the details and when.

export const creditors = pgTable('creditors', {
  id:             uuid('id').primaryKey().defaultRandom(),
  name:           text('name').notNull().unique(),          // as shown to recipients
  category:       text('category').notNull().default('other'), // energy | water | council | telecoms | lender | bnpl | other
  aliases:        jsonb('aliases').$type<string[]>().notNull().default([]), // other names seen on bills
  sortCode:       text('sort_code').notNull(),
  accountNumber:  text('account_number').notNull(),
  referenceLabel: text('reference_label').notNull().default('Customer reference'), // what the reference is called on their bills
  referenceHint:  text('reference_hint'),                   // where to find it
  isActive:       boolean('is_active').notNull().default(true),
  isTestData:     boolean('is_test_data').notNull().default(false), // dev-only rows — never served in production
  verifiedAt:     timestamp('verified_at').notNull(),
  verifiedBy:     text('verified_by').notNull(),
  verificationNote: text('verification_note'),
  createdAt:      timestamp('created_at').notNull().defaultNow(),
  updatedAt:      timestamp('updated_at').notNull().defaultNow(),
  deletedAt:      timestamp('deleted_at'),
})

// A recipient asking for a creditor that is not on the list yet.
export const creditorRequests = pgTable('creditor_requests', {
  id:           uuid('id').primaryKey().defaultRandom(),
  userId:       uuid('user_id').notNull().references(() => users.id),
  creditorName: text('creditor_name').notNull(),
  note:         text('note'),
  status:       text('status').notNull().default('open'),   // open | added | declined
  createdAt:    timestamp('created_at').notNull().defaultNow(),
  updatedAt:    timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  userIdx: index('creditor_requests_user_id_idx').on(t.userId),
}))

// ─── Debts ────────────────────────────────────────────────────────────────────

export const debts = pgTable('debts', {
  id:               uuid('id').primaryKey().defaultRandom(),
  userId:           uuid('user_id').notNull().references(() => users.id),
  // The vetted creditor this debt was created from. Name and bank details below
  // are copied from that creditor at creation (null only for legacy/dev debts).
  creditorId:       uuid('creditor_id').references(() => creditors.id),
  creditorName:     text('creditor_name').notNull(),          // e.g. "Zilch", "Council Tax"
  creditorSortCode: text('creditor_sort_code').notNull(),     // from the vetted creditor list
  creditorAccount:  text('creditor_account').notNull(),       // from the vetted creditor list
  creditorRef:      text('creditor_reference'),               // payment reference for creditor
  totalAmountPence: integer('total_amount_pence').notNull(),  // original balance in pence
  paidAmountPence:  integer('paid_amount_pence').notNull().default(0),
  status:           debtStatusEnum('status').notNull().default('active'),
  // Payee verified — true when the bank details came from the vetted creditor
  // list. Must be true before any payment.
  copVerified:      boolean('cop_verified').notNull().default(false),
  copVerifiedAt:    timestamp('cop_verified_at'),
  // Open banking data (optional — from AIS)
  truelayerAccountId: text('truelayer_account_id'),
  createdAt:        timestamp('created_at').notNull().defaultNow(),
  updatedAt:        timestamp('updated_at').notNull().defaultNow(),
  deletedAt:        timestamp('deleted_at'),
}, (t) => ({
  userIdx: index('debts_user_id_idx').on(t.userId),
}))

// ─── Invites ──────────────────────────────────────────────────────────────────

export const invites = pgTable('invites', {
  id:             uuid('id').primaryKey().defaultRandom(),
  token:          text('token').notNull().unique(),     // HMAC-signed, URL-safe
  userId:         uuid('user_id').notNull().references(() => users.id),
  debtId:         uuid('debt_id').references(() => debts.id),  // nullable — user-level invites let contributor choose
  privacyLevel:   privacyLevelEnum('privacy_level').notNull().default('amount_only'),
  personalMessage: text('personal_message'),            // optional message from recipient
  maxAmountPence: integer('max_amount_pence'),           // optional cap on contribution
  expiresAt:      timestamp('expires_at').notNull(),    // default 30 days
  status:         inviteStatusEnum('status').notNull().default('active'),
  openCount:      integer('open_count').notNull().default(0),
  createdAt:      timestamp('created_at').notNull().defaultNow(),
  updatedAt:      timestamp('updated_at').notNull().defaultNow(),
  revokedAt:      timestamp('revoked_at'),
  revokedReason:  text('revoked_reason'),
}, (t) => ({
  tokenIdx: uniqueIndex('invites_token_idx').on(t.token),
  userIdx:  index('invites_user_id_idx').on(t.userId),
  debtIdx:  index('invites_debt_id_idx').on(t.debtId),
}))

// ─── Payments ─────────────────────────────────────────────────────────────────

export const payments = pgTable('payments', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  inviteId:             uuid('invite_id').notNull().references(() => invites.id),
  debtId:               uuid('debt_id').notNull().references(() => debts.id),
  recipientUserId:      uuid('recipient_user_id').notNull().references(() => users.id),

  // Contributor (no account required — they pay as a guest)
  contributorEmail:     text('contributor_email').notNull(),
  contributorName:      text('contributor_name').notNull(),
  contributorIp:        text('contributor_ip'),

  // Amounts (ALL in pence — never floats)
  grossAmountPence:     integer('gross_amount_pence').notNull(),  // what contributor pays
  feeAmountPence:       integer('fee_amount_pence').notNull(),    // Bolster 1.5% fee
  netAmountPence:       integer('net_amount_pence').notNull(),    // what creditor receives

  status:               paymentStatusEnum('status').notNull().default('initiated'),

  // TrueLayer payment data
  truelayerPaymentId:   text('truelayer_payment_id'),
  truelayerAuthUri:     text('truelayer_auth_uri'),   // redirect URL for SCA
  settledAt:            timestamp('settled_at'),

  // Stripe Checkout session (card rail). Lets us ask Stripe directly whether
  // a payment was paid when a webhook is missed, instead of waiting forever.
  stripeSessionId:      text('stripe_session_id'),
  lastReconciledAt:     timestamp('last_reconciled_at'),

  // AML
  amlScreeningId:       uuid('aml_screening_id').references(() => amlScreenings.id),

  // Consumer Duty outcome record
  consumerDutyRecordedAt: timestamp('consumer_duty_recorded_at'),

  createdAt:            timestamp('created_at').notNull().defaultNow(),
  updatedAt:            timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  inviteIdx:    index('payments_invite_id_idx').on(t.inviteId),
  debtIdx:      index('payments_debt_id_idx').on(t.debtId),
  recipientIdx: index('payments_recipient_user_id_idx').on(t.recipientUserId),
  truelayerIdx: index('payments_truelayer_payment_id_idx').on(t.truelayerPaymentId),
  stripeSessionIdx: index('payments_stripe_session_id_idx').on(t.stripeSessionId),
}))

// ─── AML Screenings ───────────────────────────────────────────────────────────

export const amlScreenings = pgTable('aml_screenings', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  subjectType:         text('subject_type').notNull(), // 'contributor' | 'recipient'
  subjectName:         text('subject_name').notNull(),
  subjectEmail:        text('subject_email'),
  complyAdvantageId:   text('comply_advantage_id'),
  result:              amlResultEnum('result').notNull(),
  matchCount:          integer('match_count').notNull().default(0),
  rawResponse:         jsonb('raw_response'),          // full CA response stored
  reviewedAt:          timestamp('reviewed_at'),
  reviewedBy:          text('reviewed_by'),            // MLRO if manual review
  createdAt:           timestamp('created_at').notNull().defaultNow(),
})

// ─── Audit Log — IMMUTABLE. No updates. No deletes. ──────────────────────────

export const auditLog = pgTable('audit_log', {
  id:           uuid('id').primaryKey().defaultRandom(),
  eventType:    auditEventTypeEnum('event_type').notNull(),
  userId:       uuid('user_id'),                // recipient if applicable
  entityType:   text('entity_type').notNull(),  // 'payment' | 'invite' | 'debt' | 'user'
  entityId:     uuid('entity_id').notNull(),
  actorType:    text('actor_type').notNull(),   // 'system' | 'user' | 'webhook'
  actorId:      text('actor_id'),
  metadata:     jsonb('metadata'),              // event-specific data
  ipAddress:    text('ip_address'),
  userAgent:    text('user_agent'),
  createdAt:    timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  userIdx:      index('audit_log_user_id_idx').on(t.userId),
  entityIdx:    index('audit_log_entity_idx').on(t.entityType, t.entityId),
  eventIdx:     index('audit_log_event_type_idx').on(t.eventType),
  createdAtIdx: index('audit_log_created_at_idx').on(t.createdAt),
}))

// ─── Refresh Tokens ───────────────────────────────────────────────────────────

export const refreshTokens = pgTable('refresh_tokens', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    uuid('user_id').notNull().references(() => users.id),
  tokenHash: text('token_hash').notNull().unique(), // store hash, never plaintext
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  revokedAt: timestamp('revoked_at'),
}, (t) => ({
  userIdx: index('refresh_tokens_user_id_idx').on(t.userId),
}))

// ─── Password Reset Tokens ────────────────────────────────────────────────────
// Single-use, short-lived. Only the SHA-256 hash is stored — the raw token
// exists only in the emailed link, so a database leak cannot reset passwords.

export const passwordResetTokens = pgTable('password_reset_tokens', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    uuid('user_id').notNull().references(() => users.id),
  tokenHash: text('token_hash').notNull().unique(), // store hash, never plaintext
  expiresAt: timestamp('expires_at').notNull(),
  usedAt:    timestamp('used_at'),                  // set when used OR superseded by a newer link
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  userIdx: index('password_reset_tokens_user_id_idx').on(t.userId),
}))

// ─── Type exports (inferred from schema) ─────────────────────────────────────

export type User        = typeof users.$inferSelect
export type NewUser     = typeof users.$inferInsert
export type Debt        = typeof debts.$inferSelect
export type NewDebt     = typeof debts.$inferInsert
export type Invite      = typeof invites.$inferSelect
export type NewInvite   = typeof invites.$inferInsert
export type Payment     = typeof payments.$inferSelect
export type NewPayment  = typeof payments.$inferInsert
export type AuditLog    = typeof auditLog.$inferSelect
export type AmlScreening = typeof amlScreenings.$inferSelect
export type Creditor    = typeof creditors.$inferSelect
export type NewCreditor = typeof creditors.$inferInsert
