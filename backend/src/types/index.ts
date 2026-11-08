import { z } from 'zod'

// ─── Result type — explicit success/failure, no throwing ──────────────────────

export type Result<T, E = Error> =
  | { ok: true;  value: T }
  | { ok: false; error: E }

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value }
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error }
}

// ─── Common schemas ───────────────────────────────────────────────────────────

export const uuidSchema = z.string().uuid()

export const penceSchema = z
  .number()
  .int('Amount must be in whole pence (no decimals)')
  .positive('Amount must be positive')

export const sortCodeSchema = z
  .string()
  .regex(/^\d{6}$/, 'Sort code must be exactly 6 digits (no dashes)')

export const accountNumberSchema = z
  .string()
  .regex(/^\d{8}$/, 'Account number must be exactly 8 digits')

// ─── Auth schemas ─────────────────────────────────────────────────────────────

// One password policy for registration and password reset.
export const passwordSchema = z.string()
  .min(12, 'Password must be at least 12 characters')
  .max(200, 'Password must be at most 200 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[!@#$%^&*()\-_=+[\]{};:'",.<>/?\\|`~]/, 'Password must contain at least one special character (e.g. !@#$%^&*)')

export const registerSchema = z.object({
  email:     z.string().email(),
  password:  passwordSchema,
  firstName: z.string().min(1).max(100),
  lastName:  z.string().min(1).max(100),
  phone:     z.string().regex(/^\+44\d{10}$/, 'Must be a UK mobile number (+44...)').optional(),
})

export const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
})

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
})

// Raw reset token from the emailed link (32 random bytes, base64url = 43 chars)
export const resetTokenSchema = z.string().min(32).max(128)

export const validateResetTokenSchema = z.object({
  token: resetTokenSchema,
})

export const resetPasswordSchema = z.object({
  token:    resetTokenSchema,
  password: passwordSchema,
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput    = z.infer<typeof loginSchema>

// ─── Debt schemas ─────────────────────────────────────────────────────────────

// A debt is created from a creditor on Bolster's vetted list. Recipients never
// supply a sort code or account number — those come from the list.
export const createDebtSchema = z.object({
  creditorId:       uuidSchema,
  // The recipient's account/customer number with the creditor. Sent as the
  // payment reference so the creditor can match the money to their account.
  // Faster Payments references are at most 18 characters.
  creditorRef:      z.string().trim()
    .min(1, 'Please enter your reference so the creditor can match the payment')
    .max(18, 'References can be at most 18 characters')
    .regex(/^[A-Za-z0-9 \-\/.&]+$/, 'References can only contain letters, numbers, spaces and - / . &'),
  totalAmountPence: penceSchema.max(1_000_000_00, 'Maximum debt amount is £1,000,000'),
})

export type CreateDebtInput = z.infer<typeof createDebtSchema>

// A photo or PDF of a bill, sent as base64. ~7 MB of base64 ≈ 5 MB of file.
export const BILL_SCAN_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const
export const BILL_SCAN_MAX_BASE64_CHARS = 7_000_000

export const scanBillSchema = z.object({
  mediaType: z.enum(BILL_SCAN_MEDIA_TYPES, {
    errorMap: () => ({ message: 'Please upload a photo (JPG or PNG) or a PDF' }),
  }),
  data: z.string()
    .min(100, 'That file looks empty')
    .max(BILL_SCAN_MAX_BASE64_CHARS, 'That file is too large — please use one under 5 MB')
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'That file could not be read'),
})

// ─── Creditor schemas ─────────────────────────────────────────────────────────

export const creditorSearchSchema = z.object({
  q: z.string().trim().max(100).optional(),
})

export const creditorRequestSchema = z.object({
  creditorName: z.string().trim().min(2, 'Please enter the creditor\'s name').max(200),
  note:         z.string().trim().max(500).optional(),
})

// Used by the creditor import script — the only way real creditors are added.
export const creditorImportSchema = z.object({
  name:             z.string().trim().min(2).max(200),
  category:         z.enum(['energy', 'water', 'council', 'telecoms', 'lender', 'bnpl', 'other']),
  aliases:          z.array(z.string().trim().min(1).max(200)).default([]),
  sortCode:         sortCodeSchema,
  accountNumber:    accountNumberSchema,
  referenceLabel:   z.string().trim().min(1).max(100).default('Customer reference'),
  referenceHint:    z.string().trim().max(300).optional(),
  verifiedBy:       z.string().trim().min(2, 'Record who verified these bank details'),
  verificationNote: z.string().trim().min(5, 'Record how these bank details were verified'),
})

export type CreditorImport = z.infer<typeof creditorImportSchema>

// ─── Invite schemas ───────────────────────────────────────────────────────────

export const createInviteSchema = z.object({
  debtId:          uuidSchema.optional(),  // optional — user-level invites let contributor choose
  privacyLevel:    z.enum(['amount_only', 'creditor_name', 'full_balance']),
  personalMessage: z.string().max(500).optional(),
  maxAmountPence:  penceSchema.optional(),
  expiresInDays:   z.number().int().min(1).max(90).default(30),
})

export type CreateInviteInput = z.infer<typeof createInviteSchema>

// ─── Payment schemas ──────────────────────────────────────────────────────────

export const initiatePaymentSchema = z.object({
  inviteToken:       z.string().min(1),
  debtId:            uuidSchema,  // contributor selects which debt to pay
  amountPence:       penceSchema,
  contributorEmail:  z.string().email(),
  contributorName:   z.string().min(1).max(200),
  // The total the contributor was shown at checkout. If the server's own
  // calculation differs, the payment is refused rather than charging a
  // different amount to the one they agreed to.
  expectedGrossAmountPence: penceSchema.optional(),
})

export type InitiatePaymentInput = z.infer<typeof initiatePaymentSchema>

// Query string for GET /payments/quote — amount arrives as a string
export const quotePaymentSchema = z.object({
  amountPence: z.coerce
    .number()
    .int('Amount must be in whole pence (no decimals)')
    .positive('Amount must be positive'),
})

/** Raised when the total shown to the contributor no longer matches ours. */
export class QuoteChangedError extends Error {
  readonly code = 'QUOTE_CHANGED'
  constructor(readonly currentGrossAmountPence: number) {
    super('The total for this payment has changed. Please review the updated amount before paying.')
    this.name = 'QuoteChangedError'
  }
}

// ─── API response types ───────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean
  data?:   T
  error?:  string
  code?:   string
}

export interface PaginatedResponse<T> {
  items:      T[]
  total:      number
  page:       number
  pageSize:   number
  totalPages: number
}

// ─── JWT payload ──────────────────────────────────────────────────────────────

export interface JwtPayload {
  sub:       string   // user ID
  email:     string
  kycStatus: string
  iat:       number
  exp:       number
}

// ─── Fee calculation ──────────────────────────────────────────────────────────

export interface FeeCalculation {
  grossAmountPence: number   // what contributor pays
  feeAmountPence:   number   // Bolster fee
  netAmountPence:   number   // what creditor receives
  feePercentage:    number   // actual percentage applied
}

// ─── TrueLayer types ──────────────────────────────────────────────────────────

export interface TruelayerPaymentResponse {
  id:             string
  status:         'authorization_required' | 'authorizing' | 'authorized' | 'executed' | 'settled' | 'failed'
  authorizationFlow?: {
    actions: Array<{
      type:        string
      uri?:        string
    }>
  }
  createdAt:      string
  executedAt?:    string
  settledAt?:     string
  failureReason?: string
}

export interface TruelayerWebhookEvent {
  type:      string
  eventId:   string
  eventVersion: number
  paymentId: string
  timestamp: string
  metadata?: Record<string, unknown>
}
