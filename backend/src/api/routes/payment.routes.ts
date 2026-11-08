import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { payments } from '../../db/schema/index.js'
import { initiatePaymentSchema, quotePaymentSchema, QuoteChangedError } from '../../types/index.js'
import { paymentService } from '../../services/payment/payment.service.js'
import { calculateFee, getFeePolicy, validatePaymentAmount } from '../../utils/fees.js'
import { env } from '../../config/env.js'
import { authenticate } from '../hooks/auth.hook.js'
import type { JwtPayload } from '../../types/index.js'

export async function paymentRoutes(app: FastifyInstance) {

  // ── GET /api/v1/payments/quote?amountPence=5000 — PUBLIC ─────────────────
  // Exact fee breakdown for an amount, using the same calculation as
  // /initiate. The checkout shows this BEFORE the contributor commits, so
  // they always see what the creditor receives, our fee and the total.
  // Takes no invite or personal data — it is pure arithmetic.
  app.get(
    '/quote',
    {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const query = quotePaymentSchema.safeParse(request.query)
      if (!query.success) {
        return reply.status(400).send({
          success: false,
          error:   query.error.flatten().fieldErrors.amountPence?.[0] ?? 'Invalid amount',
        })
      }

      const { amountPence } = query.data

      try {
        validatePaymentAmount(amountPence)
      } catch (e) {
        return reply.status(400).send({
          success: false,
          error:   e instanceof Error ? e.message : 'Invalid amount',
          code:    'AMOUNT_OUT_OF_RANGE',
        })
      }

      const fees = calculateFee(amountPence)

      return reply.send({
        success: true,
        data: {
          netAmountPence:   fees.netAmountPence,    // creditor receives
          feeAmountPence:   fees.feeAmountPence,    // Bolster fee
          grossAmountPence: fees.grossAmountPence,  // contributor pays
          feePolicy:        getFeePolicy(),
          // How the contributor will pay, so the checkout wording is accurate
          paymentMethod:    env.ENABLE_PAYMENT_INITIATION ? 'bank_transfer' : 'card',
        },
      })
    },
  )

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
        // The total shown at checkout is out of date — tell the client so it
        // can show the new breakdown and ask the contributor to confirm again.
        if (result.error instanceof QuoteChangedError) {
          return reply.status(409).send({
            success: false,
            error:   result.error.message,
            code:    result.error.code,
          })
        }

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
      let payment = await db.query.payments.findFirst({
        where: eq(payments.id, request.params.id),
      })

      if (!payment) {
        return reply.status(404).send({ success: false, error: 'Payment not found' })
      }

      // Self-healing: if a card payment is still pending, ask Stripe directly
      // rather than waiting on a webhook that may never arrive. The service
      // applies a cooldown so polling does not hammer Stripe.
      if ((payment.status === 'pending' || payment.status === 'initiated') && !payment.truelayerPaymentId) {
        const outcome = await paymentService.reconcileStripePayment(payment)
        if (outcome === 'settled' || outcome === 'expired') {
          payment = (await db.query.payments.findFirst({
            where: eq(payments.id, request.params.id),
          })) ?? payment
        }
      }

      // Return minimal public status — no PII
      return reply.send({
        success: true,
        data: {
          status:           payment.status,
          netAmountPence:   payment.netAmountPence,
          settledAt:        payment.settledAt,
          createdAt:        payment.createdAt,
          // How THIS payment was made: bank payments carry a TrueLayer ID,
          // card payments (Stripe) do not.
          paymentMethod:    payment.truelayerPaymentId ? 'bank_transfer' : 'card',
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
