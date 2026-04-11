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
): Promise<{ data: T; ok: true } | { error: string; ok: false }> {
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

    const json = await response.json() as { success: boolean; data?: T; error?: string }

    if (!response.ok || !json.success) {
      return { ok: false, error: json.error ?? `Request failed: ${response.status}` }
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

  create: (data: {
    creditorName:     string
    creditorSortCode: string
    creditorAccount:  string
    creditorRef?:     string
    totalAmountPence: number
  }) => apiFetch<Debt>('/debts', { method: 'POST', body: JSON.stringify(data) }),

  delete: (id: string) => apiFetch(`/debts/${id}`, { method: 'DELETE' }),
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

export interface ResolvedInvite {
  inviteId:           string
  privacyLevel:       string
  personalMessage?:   string
  recipientFirstName: string
  debt: {
    creditorName?:        string
    remainingAmountPence?: number
    inviteMaxAmountPence?: number
  }
  expiresAt: string
}

export const inviteApi = {
  list: () => apiFetch<Invite[]>('/invites'),

  create: (data: {
    debtId:          string
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

export interface PaymentStatus {
  status:         string
  netAmountPence: number
  settledAt?:     string
  createdAt:      string
}

export const paymentApi = {
  initiate: (data: {
    inviteToken:      string
    amountPence:      number
    contributorEmail: string
    contributorName:  string
  }) => apiFetch<PaymentInitiation>('/payments/initiate', {
    method: 'POST',
    body:   JSON.stringify(data),
  }),

  getStatus: (paymentId: string) =>
    apiFetch<PaymentStatus>(`/payments/${paymentId}/status`),

  list: () => apiFetch<PaymentStatus[]>('/payments'),
}

// ── KYC ───────────────────────────────────────────────────────────────────────

export const kycApi = {
  initiate: () => apiFetch<{ sdkToken: string; applicantId: string }>('/kyc/initiate', {
    method: 'POST',
  }),

  submit: () => apiFetch<{ checkId: string; message: string }>('/kyc/submit', {
    method: 'POST',
  }),

  status: () => apiFetch<{ kycStatus: string; hasApplicant: boolean }>('/kyc/status'),

  /** DEV ONLY — bypasses Onfido and returns fresh tokens with kycStatus approved. */
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

// ── Utilities ─────────────────────────────────────────────────────────────────

export function formatPence(pence: number): string {
  return new Intl.NumberFormat('en-GB', {
    style:    'currency',
    currency: 'GBP',
  }).format(pence / 100)
}
