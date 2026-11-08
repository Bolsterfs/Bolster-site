import crypto from 'crypto'
import { eq } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { users } from '../../db/schema/index.js'
import { env } from '../../config/env.js'
import { writeAuditEvent } from '../../utils/audit.js'
import type { Result } from '../../types/index.js'
import { ok, err } from '../../types/index.js'

interface VeriffSessionResponse {
  status:       string
  verification: {
    id:        string
    url:       string
    vendorData: string
    host:      string
    status:    string
    sessionToken: string
  }
}

/**
 * KYC Service — Veriff integration
 *
 * Flow:
 * 1. Create a Veriff session for the user
 * 2. Redirect user to the Veriff session URL
 * 3. User completes document + selfie verification in Veriff's hosted flow
 * 4. Our webhook (/webhooks/veriff) receives the decision
 * 5. We update user.kyc_status based on the verification result
 *
 * Required under MLR 2017 Reg 28 (Customer Due Diligence)
 * Records retained 5 years minimum (MLR 2017 Reg 40)
 */
export class KycService {
  private readonly baseUrl = 'https://stationapi.veriff.com/v1'

  private get headers() {
    return {
      'X-AUTH-CLIENT': env.VERIFF_API_KEY,
      'Content-Type':  'application/json',
    }
  }

  /**
   * Initiate KYC for a user — creates a Veriff session.
   * Returns the session URL for the frontend to redirect the user to.
   */
  async initiateKyc(userId: string): Promise<Result<{
    sessionUrl: string
    sessionId:  string
  }>> {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    })

    if (!user) return err(new Error('User not found'))
    if (user.kycStatus === 'approved') {
      return err(new Error('Identity already verified'))
    }

    try {
      // Veriff requires the callback URL to use HTTPS.
      // In development APP_URL is http://localhost:3000, so we force https here.
      // In production APP_URL is already https.
      const appUrl      = env.APP_URL.replace(/^http:\/\//, 'https://')
      const callbackUrl = `${appUrl}/kyc`

      // If we already have a session, create a fresh one — Veriff sessions
      // are stateless from our side and the user may need to retry.
      const response = await fetch(`${this.baseUrl}/sessions`, {
        method:  'POST',
        headers: this.headers,
        body: JSON.stringify({
          verification: {
            callback:   callbackUrl,
            person: {
              firstName: user.firstName,
              lastName:  user.lastName,
            },
            vendorData: userId,
          },
        }),
      })

      if (!response.ok) {
        const text = await response.text()
        return err(new Error(`Veriff session creation failed: ${response.status} — ${text}`))
      }

      const data = await response.json() as VeriffSessionResponse
      const sessionId  = data.verification.id
      const sessionUrl = data.verification.url

      await db
        .update(users)
        .set({
          kycApplicantId: sessionId,
          kycStatus:      'in_progress',
          updatedAt:      new Date(),
        })
        .where(eq(users.id, userId))

      await writeAuditEvent({
        eventType:  'kyc_initiated',
        entityType: 'user',
        entityId:   userId,
        userId,
        actorType:  'user',
        actorId:    userId,
        metadata:   { sessionId },
      })

      return ok({ sessionUrl, sessionId })
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)))
    }
  }

  /**
   * Verify a Veriff webhook signature using HMAC-SHA256.
   * Veriff signs the raw request body with the shared secret key.
   */
  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    const hmac = crypto
      .createHmac('sha256', env.VERIFF_SECRET_KEY)
      .update(Buffer.from(rawBody, 'utf8'))
      .digest('hex')

    return crypto.timingSafeEqual(
      Buffer.from(hmac, 'hex'),
      Buffer.from(signature, 'hex'),
    )
  }
}

export const kycService = new KycService()
