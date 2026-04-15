import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { payments } from '../../db/schema/index.js'
import { initiatePaymentSchema } from '../../types/index.js'
import { paymentService } from '../../services/payment/payment.service.js'
import { authenticate } from '../hooks/auth.hook.js'
import type { JwtPayload } from '../../types/index.js'

export async function paymentRoutes(app: FastifyInstance) {

  // ── POST /api/v1/payments/initiate — PUBLIC (contributors have no account) ─
  // Contributor submits payment details → gets redirected to bank for SCA
  app.post(
    '/initiate',
    {
      config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
    },
    async (request, reply) => {
      const body = initiatePaymentSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid payment data',
          details: body.error.flatten().fieldErrors,
        })
      }

      const result = await paymentService.initiatePayment(
        body.data,
        request.ip,
        request.headers['user-agent'],
      )

      if (!result.ok) {
        return reply.status(400).send({
          success: false,
          error: result.error.message,
        })
      }

      return reply.send({
        success: true,
        data: {
          paymentId:        result.value.paymentId,
          authUri:          result.value.authUri,       // redirect contributor here
          feeAmountPence:   result.value.feeAmountPence,
          grossAmountPence: result.value.grossAmountPence,
          netAmountPence:   result.value.netAmountPence,
        },
      })
    },
  )

  // ── GET /api/v1/payments/:id — PUBLIC — payment status check ─────────────
  // Called after contributor returns from SCA to show confirmation screen.
  // Higher rate limit because the confirmation page polls this endpoint.
  app.get<{ Params: { id: string } }>(
    '/:id/status',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const payment = await db.query.payments.findFirst({
        where: eq(payments.id, request.params.id),
      })

      if (!payment) {
        return reply.status(404).send({ success: false, error: 'Payment not found' })
      }

      // Return minimal public status — no PII
      return reply.send({
        success: true,
        data: {
          status:           payment.status,
          netAmountPence:   payment.netAmountPence,
          settledAt:        payment.settledAt,
          createdAt:        payment.createdAt,
        },
      })
    },
  )

  // ── GET /api/v1/payments — recipient views their payment history ──────────
  app.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user as JwtPayload

    const userPayments = await db.query.payments.findMany({
      where: eq(payments.recipientUserId, user.sub),
      orderBy: (p, { desc }) => [desc(p.createdAt)],
    })

    return reply.send({ success: true, data: userPayments })
  })
}
