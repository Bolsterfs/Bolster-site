import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { users } from '../../db/schema/index.js'
import { kycService } from '../../services/kyc/kyc.service.js'
import { authenticate } from '../hooks/auth.hook.js'
import type { JwtPayload } from '../../types/index.js'

export async function kycRoutes(app: FastifyInstance) {

  // ── POST /api/v1/kyc/initiate ─────────────────────────────────────────────
  // Creates Onfido applicant (if not already) and returns an SDK token.
  // Frontend uses the token to mount the Onfido SDK widget.
  app.post(
    '/initiate',
    {
      preHandler: [authenticate],
      config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
    },
    async (request, reply) => {
      const user = request.user as JwtPayload

      if (user.kycStatus === 'approved') {
        return reply.status(400).send({
          success: false,
          error:   'Identity already verified',
          code:    'KYC_ALREADY_APPROVED',
        })
      }

      const result = await kycService.initiateKyc(user.sub)

      if (!result.ok) {
        app.log.error({ userId: user.sub, error: result.error.message }, 'KYC initiation failed')
        return reply.status(500).send({
          success: false,
          error:   'Could not start identity verification. Please try again.',
        })
      }

      return reply.send({
        success: true,
        data: {
          sdkToken:    result.value.sdkToken,
          applicantId: result.value.applicantId,
        },
      })
    },
  )

  // ── POST /api/v1/kyc/submit ───────────────────────────────────────────────
  // Called by the frontend after the user completes the Onfido SDK flow.
  // Submits the check to Onfido — result arrives asynchronously via webhook.
  app.post(
    '/submit',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const user = request.user as JwtPayload

      if (user.kycStatus === 'approved') {
        return reply.status(400).send({
          success: false,
          error:   'Identity already verified',
          code:    'KYC_ALREADY_APPROVED',
        })
      }

      const result = await kycService.submitCheck(user.sub)

      if (!result.ok) {
        app.log.error({ userId: user.sub, error: result.error.message }, 'KYC check submission failed')
        return reply.status(500).send({
          success: false,
          error:   'Could not submit verification check. Please try again.',
        })
      }

      return reply.send({
        success: true,
        data: {
          checkId: result.value.id,
          // Result is async — frontend should poll /kyc/status or wait for push
          message: 'Verification submitted. We will notify you once the check is complete.',
        },
      })
    },
  )

  // ── GET /api/v1/kyc/status ────────────────────────────────────────────────
  // Returns the current KYC status for the logged-in user.
  // Frontend polls this after submit to know when to unblock the dashboard.
  app.get(
    '/status',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const user = request.user as JwtPayload

      const dbUser = await db.query.users.findFirst({
        where: eq(users.id, user.sub),
        columns: {
          kycStatus:      true,
          kycApplicantId: true,
        },
      })

      if (!dbUser) {
        return reply.status(404).send({ success: false, error: 'User not found' })
      }

      return reply.send({
        success: true,
        data: {
          kycStatus:    dbUser.kycStatus,
          hasApplicant: !!dbUser.kycApplicantId,
        },
      })
    },
  )
}
