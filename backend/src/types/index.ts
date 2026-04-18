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

export const registerSchema = z.object({
  email:     z.string().email(),
  password:  z.string().min(12, 'Password must be at least 12 characters'),
  firstName: z.string().min(1).max(100),
  lastName:  z.string().min(1).max(100),
  phone:     z.string().regex(/^\+44\d{10}$/, 'Must be a UK mobile number (+44...)').optional(),
})

export const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput    = z.infer<typeof loginSchema>

// ─── Debt schemas ─────────────────────────────────────────────────────────────

export const createDebtSchema = z.object({
  creditorName:     z.string().min(1).max(200),
  creditorSortCode: sortCodeSchema,
  creditorAccount:  accountNumberSchema,
  creditorRef:      z.string().max(18).optional(),
  totalAmountPence: penceSchema.max(1_000_000_00, 'Maximum debt amount is £1,000,000'),
})

export type CreateDebtInput = z.infer<typeof createDebtSchema>

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
})

export type InitiatePaymentInput = z.infer<typeof initiatePaymentSchema>

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
