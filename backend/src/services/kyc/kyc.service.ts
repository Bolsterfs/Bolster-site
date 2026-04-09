import { eq } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { users } from '../../db/schema/index.js'
import { env } from '../../config/env.js'
import { writeAuditEvent } from '../../utils/audit.js'
import type { Result } from '../../types/index.js'
import { ok, err } from '../../types/index.js'

interface OnfidoApplicantResponse {
  id:         string
  first_name: string
  last_name:  string
  email:      string
  created_at: string
}

interface OnfidoCheckResponse {
  id:          string
  status:      string
  result?:     string
  href:        string
  created_at:  string
}

interface OnfidoSdkTokenResponse {
  token: string
}

/**
 * KYC Service — Onfido integration
 *
 * Flow:
 * 1. Create Onfido applicant for the user
 * 2. Generate SDK token for the frontend Onfido SDK
 * 3. User completes document + liveness check in browser
 * 4. Our webhook (/webhooks/onfido) receives the result
 * 5. We update user.kyc_status based on the check result
 *
 * Required under MLR 2017 Reg 28 (Customer Due Diligence)
 * Records retained 5 years minimum (MLR 2017 Reg 40)
 */
export class KycService {
  private readonly baseUrl = env.ONFIDO_REGION === 'EU'
    ? 'https://api.eu.onfido.com/v3.6'
    : 'https://api.us.onfido.com/v3.6'

  private get headers() {
    return {
      'Authorization': `Token token=${env.ONFIDO_API_TOKEN}`,
      'Content-Type':  'application/json',
    }
  }

  /**
   * Initiate KYC for a user — creates Onfido applicant + returns SDK token.
   * The frontend uses the SDK token to launch the Onfido SDK widget.
   */
  async initiateKyc(userId: string): Promise<Result<{
    sdkToken:    string
    applicantId: string
  }>> {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    })

    if (!user) return err(new Error('User not found'))
    if (user.kycStatus === 'approved') {
      return err(new Error('Identity already verified'))
    }

    try {
      // Step 1: Create or reuse applicant
      let applicantId = user.kycApplicantId

      if (!applicantId) {
        const applicantResult = await this.createApplicant(
          user.firstName,
          user.lastName,
          user.email,
        )
        if (!applicantResult.ok) return err(applicantResult.error)

        applicantId = applicantResult.value.id

        await db
          .update(users)
          .set({
            kycApplicantId: applicantId,
            kycStatus:      'in_progress',
            updatedAt:      new Date(),
          })
          .where(eq(users.id, userId))
      }

      // Step 2: Generate SDK token for the frontend
      const tokenResult = await this.generateSdkToken(applicantId)
      if (!tokenResult.ok) return err(tokenResult.error)

      await writeAuditEvent({
        eventType:  'kyc_initiated',
        entityType: 'user',
        entityId:   userId,
        userId,
        actorType:  'user',
        actorId:    userId,
        metadata:   { applicantId },
      })

      return ok({ sdkToken: tokenResult.value.token, applicantId })
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)))
    }
  }

  /**
   * After the user completes the SDK flow, submit a check.
   * Result comes back via webhook.
   */
  async submitCheck(userId: string): Promise<Result<OnfidoCheckResponse>> {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    })

    if (!user?.kycApplicantId) {
      return err(new Error('KYC not initiated — call initiateKyc first'))
    }

    try {
      const response = await fetch(`${this.baseUrl}/checks`, {
        method:  'POST',
        headers: this.headers,
        body: JSON.stringify({
          applicant_id: user.kycApplicantId,
          report_names: ['document', 'facial_similarity_photo'],
          // Webhook receives result — configured in Onfido dashboard
        }),
      })

      if (!response.ok) {
        const text = await response.text()
        return err(new Error(`Onfido check submission failed: ${response.status} — ${text}`))
      }

      const check = await response.json() as OnfidoCheckResponse

      await db
        .update(users)
        .set({ kycCheckId: check.id, updatedAt: new Date() })
        .where(eq(users.id, userId))

      return ok(check)
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)))
    }
  }

  private async createApplicant(
    firstName: string,
    lastName:  string,
    email:     string,
  ): Promise<Result<OnfidoApplicantResponse>> {
    const response = await fetch(`${this.baseUrl}/applicants`, {
      method:  'POST',
      headers: this.headers,
      body: JSON.stringify({ first_name: firstName, last_name: lastName, email }),
    })

    if (!response.ok) {
      return err(new Error(`Onfido applicant creation failed: ${response.status}`))
    }

    return ok(await response.json() as OnfidoApplicantResponse)
  }

  private async generateSdkToken(
    applicantId: string,
  ): Promise<Result<OnfidoSdkTokenResponse>> {
    const response = await fetch(`${this.baseUrl}/sdk_token`, {
      method:  'POST',
      headers: this.headers,
      body: JSON.stringify({
        applicant_id:  applicantId,
        referrer:      `${env.APP_URL}/*`,
      }),
    })

    if (!response.ok) {
      return err(new Error(`Onfido SDK token generation failed: ${response.status}`))
    }

    return ok(await response.json() as OnfidoSdkTokenResponse)
  }
}

export const kycService = new KycService()
