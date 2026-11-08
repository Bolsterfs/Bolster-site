/**
 * Typed API client for Bolster backend.
 *
 * All calls go through this client — no raw fetch() calls in components.
 * Token management is handled here; components just call the method they need.
 */

const API_BASE = '/api/v1'

// ── Token storage ─────────────────────────────────────────────────────────────
// Access token: sessionStorage so it survives client-side navigations and page
// refreshes within the same tab, but is cleared when the tab closes.
// Refresh token: memory only — intentionally lost on hard refresh (more secure).
// No localStorage — tokens must never persist across browser restarts.

const SESSION_KEY = 'bolster_at'

// Initialise from sessionStorage on module load (client only — window is
// undefined during Next.js SSR, in which case we start unauthenticated).
let accessToken: string | null =
  typeof window !== 'undefined' ? sessionStorage.getItem(SESSION_KEY) : null

export function getAccessToken(): string | null {
  return accessToken
}

export function setAccessToken(token: string) {
  accessToken = token
  if (typeof window !== 'undefined') sessionStorage.setItem(SESSION_KEY, token)
}

export function clearTokens() {
  accessToken = null
  if (typeof window !== 'undefined') sessionStorage.removeItem(SESSION_KEY)
}

// ── Base fetch wrapper ────────────────────────────────────────────────────────

async function apiFetch<T>(
  path:    string,
  options: RequestInit = {},
): Promise<{ data: T; ok: true } | { error: string; code?: string; ok: false }> {
  const headers: Record<string, string> = {
    ...(options.body !== undefined && options.body !== null
      ? { 'Content-Type': 'application/json' }
      : {}),
    ...(options.headers as Record<string, string> | undefined),
  }

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    })

    const json = await response.json() as { success: boolean; data?: T; error?: string; code?: string }

    if (!response.ok || !json.success) {
      return {
        ok:    false,
        error: json.error ?? `Request failed: ${response.status}`,
        ...(json.code ? { code: json.code } : {}),
      }
    }

    return { ok: true, data: json.data as T }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' }
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id:        string
  email:     string
  firstName: string
  lastName:  string
  kycStatus: string
}

export interface AuthResponse {
  user:         AuthUser
  accessToken:  string
  refreshToken: string
}

export const auth = {
  async register(data: {
    email: string
    password: string
    firstName: string
    lastName: string
    phone?: string
  }) {
    return apiFetch<AuthResponse>('/auth/register', {
      method: 'POST',
      body:   JSON.stringify(data),
    })
  },

  async login(email: string, password: string) {
    return apiFetch<AuthResponse>('/auth/login', {
      method: 'POST',
      body:   JSON.stringify({ email, password }),
    })
  },

  async logout(refreshToken: string) {
    clearTokens()
    return apiFetch('/auth/logout', {
      method: 'POST',
      body:   JSON.stringify({ refreshToken }),
    })
  },

  /** Ask for a password reset link. Always succeeds, whether or not the email has an account. */
  async forgotPassword(email: string) {
    return apiFetch<{ message: string }>('/auth/forgot-password', {
      method: 'POST',
      body:   JSON.stringify({ email }),
    })
  },

  /** Check a reset link is still usable before showing the new-password form. */
  async validateResetToken(token: string) {
    return apiFetch<{ valid: boolean }>('/auth/reset-password/validate', {
      method: 'POST',
      body:   JSON.stringify({ token }),
    })
  },

  async resetPassword(token: string, password: string) {
    return apiFetch<{ message: string }>('/auth/reset-password', {
      method: 'POST',
      body:   JSON.stringify({ token, password }),
    })
  },
}

// ── Debts ─────────────────────────────────────────────────────────────────────

export interface Debt {
  id:               string
  creditorName:     string
  totalAmountPence: number
  paidAmountPence:  number
  status:           string
  copVerified:      boolean
  createdAt:        string
}

export const debtApi = {
  list: () => apiFetch<Debt[]>('/debts'),

  /** Add a debt owed to a creditor on Bolster's vetted list. No bank details are sent. */
  create: (data: {
    creditorId:       string
    creditorRef:      string
    totalAmountPence: number
  }) => apiFetch<Debt>('/debts', { method: 'POST', body: JSON.stringify(data) }),

  delete: (id: string) => apiFetch(`/debts/${id}`, { method: 'DELETE' }),

  /** Whether bill scanning is switched on for this installation. */
  scanStatus: () => apiFetch<{ enabled: boolean }>('/debts/scan/status'),

  /** Read a photo or PDF of a bill. Returns details to CHECK — nothing is saved. */
  scanBill: (file: { mediaType: BillMediaType; data: string }) =>
    apiFetch<BillScanResult>('/debts/scan', { method: 'POST', body: JSON.stringify(file) }),
}

export type BillMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'

export interface BillScanResult {
  isBill:             boolean
  creditorNameOnBill: string | null
  matchedCreditor:    Creditor | null   // null when the creditor is not on our list
  amountPence:        number | null
  reference:          string | null
  dueDate:            string | null     // YYYY-MM-DD
  warnings:           string[]
}

// ── Creditors (Bolster's vetted list) ─────────────────────────────────────────

export interface Creditor {
  id:             string
  name:           string
  category:       string
  referenceLabel: string         // what the reference is called on this creditor's bills
  referenceHint:  string | null  // where to find it
  isTestData:     boolean
}

export const creditorApi = {
  list: () => apiFetch<Creditor[]>('/creditors'),

  /** Ask Bolster to add a creditor that is not on the list yet. */
  request: (data: { creditorName: string; note?: string }) =>
    apiFetch<{ id: string; creditorName: string; status: string }>('/creditors/requests', {
      method: 'POST',
      body:   JSON.stringify(data),
    }),
}

// ── Admin (Bolster staff only) ────────────────────────────────────────────────

export interface CreditorRequest {
  id:                string
  creditorName:      string
  note:              string | null
  status:            'open' | 'added' | 'declined'
  createdAt:         string
  updatedAt:         string
  requesterName:     string
  requesterEmail:    string
  othersAskingCount: number
}

export interface NewCreditorInput {
  name:             string
  category:         'energy' | 'water' | 'council' | 'telecoms' | 'lender' | 'bnpl' | 'other'
  aliases:          string[]
  sortCode:         string
  accountNumber:    string
  referenceLabel:   string
  referenceHint?:   string
  verifiedBy:       string
  verificationNote: string
}

export const adminApi = {
  /** 403 for anyone not in ADMIN_EMAILS — used to decide whether to show the admin link. */
  me: () => apiFetch<{ email: string; isAdmin: boolean }>('/admin/me'),

  creditorRequests: (status: 'open' | 'resolved' | 'all' = 'open') =>
    apiFetch<CreditorRequest[]>(`/admin/creditor-requests?status=${status}`),

  addCreditor: (requestId: string, creditor: NewCreditorInput) =>
    apiFetch<{ creditorId: string; name: string; resolvedRequests: number }>(
      `/admin/creditor-requests/${requestId}/add-creditor`,
      { method: 'POST', body: JSON.stringify(creditor) },
    ),

  declineRequest: (requestId: string, reason: string) =>
    apiFetch<{ id: string; status: string }>(
      `/admin/creditor-requests/${requestId}/decline`,
      { method: 'POST', body: JSON.stringify({ reason }) },
    ),
}

// ── Invites ───────────────────────────────────────────────────────────────────

export interface Invite {
  id:             string
  token:          string
  debtId:         string
  privacyLevel:   string
  personalMessage?: string
  status:         string
  expiresAt:      string
  openCount:      number
  createdAt:      string
}

export interface ResolvedInviteDebt {
  id:                    string
  creditorName?:         string
  remainingAmountPence?: number
}

export interface ResolvedInvite {
  inviteId:              string
  privacyLevel:          string
  personalMessage?:      string
  recipientFirstName:    string
  debts:                 ResolvedInviteDebt[]
  inviteMaxAmountPence?: number
  expiresAt:             string
  paymentMethod?:        'card' | 'bank_transfer'
}

export const inviteApi = {
  list: () => apiFetch<Invite[]>('/invites'),

  create: (data: {
    debtId?:         string
    privacyLevel:    'amount_only' | 'creditor_name' | 'full_balance'
    personalMessage?: string
    maxAmountPence?:  number
    expiresInDays?:   number
  }) => apiFetch<{ invite: Invite; inviteUrl: string }>(
    '/invites', { method: 'POST', body: JSON.stringify(data) },
  ),

  resolve: (token: string) =>
    apiFetch<ResolvedInvite>(`/invites/resolve/${token}`),

  revoke: (id: string, reason?: string) =>
    apiFetch(`/invites/${id}`, {
      method: 'DELETE',
      body:   JSON.stringify({ reason }),
    }),
}

// ── Payments ──────────────────────────────────────────────────────────────────

export interface PaymentInitiation {
  paymentId:        string
  authUri:          string
  feeAmountPence:   number
  grossAmountPence: number
  netAmountPence:   number
}

/** Fee rules in force — lets the checkout explain the fee in plain words. */
export interface FeePolicy {
  percentage:      number
  minFeePence:     number
  maxFeePence:     number
  minPaymentPence: number
  maxPaymentPence: number
}

/** Exact breakdown for an amount, calculated by the server. */
export interface PaymentQuote {
  netAmountPence:   number   // creditor receives
  feeAmountPence:   number   // Bolster fee
  grossAmountPence: number   // contributor pays
  feePolicy:        FeePolicy
  paymentMethod:    'card' | 'bank_transfer'
}

export interface PaymentStatus {
  status:           string
  reference:        string
  creditorName:     string
  netAmountPence:   number
  feeAmountPence:   number
  grossAmountPence: number
  settledAt?:       string | null
  createdAt:        string
  paymentMethod?:   'card' | 'bank_transfer'
}

/** One row of the recipient's payment history (never includes contributor contact details). */
export interface PaymentHistoryItem {
  id:               string
  reference:        string
  debtId:           string
  creditorName:     string
  contributorName:  string
  grossAmountPence: number
  feeAmountPence:   number
  netAmountPence:   number
  status:           string
  paymentMethod:    'card' | 'bank_transfer'
  settledAt?:       string | null
  createdAt:        string
}

export const paymentApi = {
  /** Fee breakdown for an amount — shown before the contributor commits. */
  quote: (amountPence: number, signal?: AbortSignal) =>
    apiFetch<PaymentQuote>(
      `/payments/quote?amountPence=${encodeURIComponent(amountPence)}`,
      signal ? { signal } : {},
    ),

  initiate: (data: {
    inviteToken:      string
    debtId:           string
    amountPence:      number
    contributorEmail: string
    contributorName:  string
    /** The total the contributor was shown — the server refuses if it differs. */
    expectedGrossAmountPence?: number
  }) => apiFetch<PaymentInitiation>('/payments/initiate', {
    method: 'POST',
    body:   JSON.stringify(data),
  }),

  getStatus: (paymentId: string) =>
    apiFetch<PaymentStatus>(`/payments/${paymentId}/status`),

  list: () => apiFetch<PaymentHistoryItem[]>('/payments'),
}

// ── KYC ───────────────────────────────────────────────────────────────────────

export const kycApi = {
  initiate: () => apiFetch<{ sessionUrl: string; sessionId: string }>('/kyc/initiate', {
    method: 'POST',
  }),

  status: () => apiFetch<{ kycStatus: string; hasSession: boolean }>('/kyc/status'),

  /** DEV ONLY — bypasses Veriff and returns fresh tokens with kycStatus approved. */
  devApprove: () => apiFetch<{ accessToken: string; refreshToken: string }>('/kyc/dev-approve', {
    method: 'POST',
  }),
}

// ── Refresh token (in-memory only — same security posture as access token) ────

let refreshToken: string | null = null

export function setRefreshToken(token: string) { refreshToken = token }
export function getRefreshToken(): string | null { return refreshToken }

export function clearAllTokens() {
  accessToken  = null
  refreshToken = null
  if (typeof window !== 'undefined') sessionStorage.removeItem(SESSION_KEY)
}

// ── Dev tools (development only) ──────────────────────────────────────────────

export const devApi = {
  seed: () => apiFetch<{ debtId: string; inviteUrl: string }>('/dev/seed', {
    method: 'POST',
  }),
  approveKyc: () => apiFetch<{ kycStatus: string }>('/dev/approve-kyc', {
    method: 'POST',
  }),
  /** DEV ONLY — marks the signed-in user's unverified debts as verified. */
  verifyDebts: () => apiFetch<{ verifiedCount: number }>('/dev/verify-debts', {
    method: 'POST',
  }),
  /** DEV ONLY — asks Stripe about every pending card payment right now. */
  reconcileStripe: () =>
    apiFetch<{ checked: number; settled: number; expired: number; unknown: number }>(
      '/dev/reconcile-stripe',
      { method: 'POST' },
    ),
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/** Decode a JWT payload without verification — for display only. */
export function decodeTokenPayload(): { email?: string; kycStatus?: string } | null {
  const token = getAccessToken()
  if (!token) return null
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    return JSON.parse(atob(payload))
  } catch {
    return null
  }
}

export function formatPence(pence: number): string {
  return new Intl.NumberFormat('en-GB', {
    style:    'currency',
    currency: 'GBP',
  }).format(pence / 100)
}
