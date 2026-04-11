import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import crypto from 'crypto'
import { db } from '../../db/client.js'
import { users, refreshTokens } from '../../db/schema/index.js'
import { kycService } from '../../services/kyc/kyc.service.js'
import { authenticate } from '../hooks/auth.hook.js'
import { writeAuditEvent } from '../../utils/audit.js'
import { env } from '../../config/env.js'
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

  // ── POST /api/v1/kyc/dev-approve — DEV ONLY ──────────────────────────────
  // Immediately marks the user as KYC approved without Onfido.
  // Only registered when NODE_ENV=development — never reachable in production.
  if (env.NODE_ENV === 'development') {
    app.post('/dev-approve', { preHandler: [authenticate] }, async (request, reply) => {
      const user = request.user as JwtPayload

      const [updated] = await db
        .update(users)
        .set({ kycStatus: 'approved', updatedAt: new Date() })
        .where(eq(users.id, user.sub))
        .returning({ id: users.id, email: users.email, kycStatus: users.kycStatus })

      if (!updated) {
        return reply.status(404).send({ success: false, error: 'User not found' })
      }

      await writeAuditEvent({
        eventType:  'kyc_completed',
        entityType: 'user',
        entityId:   user.sub,
        userId:     user.sub,
        actorType:  'system',
        actorId:    'dev-bypass',
        metadata:   { method: 'dev_bypass' },
        ipAddress:  request.ip,
      })

      // Issue fresh tokens — the existing JWT still carries kycStatus:'pending',
      // so we give back a new pair so the caller can skip the /auth/refresh step.
      const accessToken = app.jwt.sign(
        { sub: updated.id, email: updated.email, kycStatus: updated.kycStatus },
        { expiresIn: env.JWT_ACCESS_EXPIRES_IN },
      )

      const rawRefreshToken = crypto.randomBytes(64).toString('base64url')
      const tokenHash       = crypto.createHash('sha256').update(rawRefreshToken).digest('hex')
      const expiresAt       = new Date()
      expiresAt.setDate(expiresAt.getDate() + 7)
      await db.insert(refreshTokens).values({ userId: updated.id, tokenHash, expiresAt })

      return reply.send({
        success: true,
        data:    { accessToken, refreshToken: rawRefreshToken },
      })
    })
  }

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
