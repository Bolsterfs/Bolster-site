import { env } from '../../config/env.js'
import type { TruelayerPaymentResponse, Result } from '../../types/index.js'
import { ok, err } from '../../types/index.js'

interface TruelayerPaymentRequest {
  amountInMinor:       number       // pence
  currency:            'GBP'
  beneficiaryName:     string
  beneficiarySortCode: string
  beneficiaryAccount:  string
  paymentReference:    string       // shown on creditor's statement
  returnUri:           string       // where to send contributor after SCA
  metadata?: {
    bolsterPaymentId:  string
    inviteToken:       string
  }
}

/**
 * TrueLayer Payment Initiation Service
 *
 * Critical architecture note:
 * - We operate as TrueLayer's agent under their FCA PISP licence
 * - Payment routes: contributor's bank → Faster Payments → creditor's account
 * - Bolster NEVER holds funds — no Bolster bank account in this flow
 * - SCA is handled by TrueLayer redirect (bank's own auth) — we NEVER capture credentials
 */
export class TruelayerPaymentService {
  private accessToken: string | null = null
  private tokenExpiresAt: Date | null = null

  private get headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Accept':       'application/json',
    }
  }

  /** Get a fresh client credentials access token */
  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid (with 60s buffer)
    if (this.accessToken && this.tokenExpiresAt) {
      const bufferMs = 60_000
      if (new Date().getTime() + bufferMs < this.tokenExpiresAt.getTime()) {
        return this.accessToken
      }
    }

    const response = await fetch(`${env.TRUELAYER_AUTH_URL}/connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'client_credentials',
        client_id:     env.TRUELAYER_CLIENT_ID,
        client_secret: env.TRUELAYER_CLIENT_SECRET,
        scope:         'payments',
      }),
    })

    if (!response.ok) {
      throw new Error(`TrueLayer auth failed: ${response.status} ${response.statusText}`)
    }

    const data = await response.json() as {
      access_token: string
      expires_in:   number
    }

    this.accessToken    = data.access_token
    this.tokenExpiresAt = new Date(Date.now() + data.expires_in * 1000)

    return this.accessToken
  }

  /**
   * Initiate a payment from contributor to creditor.
   *
   * Returns a TrueLayer payment ID and the auth URI to redirect
   * the contributor to for Strong Customer Authentication.
   */
  async initiatePayment(
    request: TruelayerPaymentRequest,
  ): Promise<Result<TruelayerPaymentResponse>> {
    try {
      const token = await this.getAccessToken()

      const body = {
        amount_in_minor: request.amountInMinor,
        currency:        request.currency,
        payment_method: {
          type:   'bank_transfer',
          beneficiary: {
            type:           'external_account',
            account_holder_name: request.beneficiaryName,
            reference:      request.paymentReference,
            account_identifier: {
              type:           'sort_code_account_number',
              sort_code:      request.beneficiarySortCode,
              account_number: request.beneficiaryAccount,
            },
          },
        },
        return_uri: request.returnUri,
        metadata:   request.metadata ?? {},
      }

      const response = await fetch(`${env.TRUELAYER_API_URL}/payments`, {
        method:  'POST',
        headers: { ...this.headers, Authorization: `Bearer ${token}` },
        body:    JSON.stringify(body),
      })

      if (!response.ok) {
        const errorText = await response.text()
        return err(new Error(`TrueLayer payment initiation failed: ${response.status} — ${errorText}`))
      }

      const data = await response.json() as TruelayerPaymentResponse
      return ok(data)
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)))
    }
  }

  /** Get the current status of a payment */
  async getPaymentStatus(
    paymentId: string,
  ): Promise<Result<TruelayerPaymentResponse>> {
    try {
      const token = await this.getAccessToken()

      const response = await fetch(
        `${env.TRUELAYER_API_URL}/payments/${paymentId}`,
        { headers: { ...this.headers, Authorization: `Bearer ${token}` } },
      )

      if (!response.ok) {
        return err(new Error(`TrueLayer payment status failed: ${response.status}`))
      }

      const data = await response.json() as TruelayerPaymentResponse
      return ok(data)
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)))
    }
  }

  /**
   * Verify a TrueLayer webhook signature.
   * MUST be called before processing any webhook event.
   */
  verifyWebhookSignature(
    payload:   string,
    signature: string,
  ): boolean {
    // TrueLayer uses JWS signatures — verify against their public key
    // In production, fetch TrueLayer's JWKS from their well-known endpoint
    // For now, verify the webhook secret header
    const crypto = require('crypto')
    const expected = crypto
      .createHmac('sha256', env.TRUELAYER_WEBHOOK_SECRET)
      .update(payload)
      .digest('hex')

    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex'),
    )
  }
}

export const truelayerService = new TruelayerPaymentService()
