import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { users } from '../../db/schema/index.js'
import { truelayerService } from '../../services/payment/truelayer.js'
import { stripeService } from '../../services/payment/stripe.service.js'
import { paymentService } from '../../services/payment/payment.service.js'
import { kycService } from '../../services/kyc/kyc.service.js'
import { writeAuditEvent } from '../../utils/audit.js'
import { env } from '../../config/env.js'
import type { TruelayerWebhookEvent } from '../../types/index.js'

export async function webhookRoutes(app: FastifyInstance) {

  // ── POST /webhooks/truelayer — payment status updates ────────────────────
  // TrueLayer sends events when payment status changes (settled, failed, etc.)
  // MUST verify signature before processing — reject anything unsigned
  app.post(
    '/truelayer',
    { config: { rawBody: true } }, // need raw body for signature verification
    async (request, reply) => {
      const signature = request.headers['x-tl-signature'] as string | undefined

      if (!signature) {
        return reply.status(400).send({ error: 'Missing signature header' })
      }

      const rawBody = (request as unknown as { rawBody: string }).rawBody ?? ''

      const isValid = truelayerService.verifyWebhookSignature(rawBody, signature)
      if (!isValid) {
        app.log.warn({ headers: request.headers }, 'TrueLayer webhook signature verification failed')
        return reply.status(401).send({ error: 'Invalid webhook signature' })
      }

      const event = request.body as TruelayerWebhookEvent

      app.log.info({ eventType: event.type, paymentId: event.paymentId }, 'TrueLayer webhook received')

      switch (event.type) {
        case 'payment_settled':
          await paymentService.handlePaymentSettled(event.paymentId)
          break

        case 'payment_failed':
          // Payment failed — update status, notify recipient
          app.log.info({ paymentId: event.paymentId }, 'Payment failed webhook received')
          // TODO: Queue notification to recipient
          break

        case 'payment_authorized':
          // SCA completed — payment processing
          app.log.info({ paymentId: event.paymentId }, 'Payment authorized')
          break

        default:
          app.log.info({ eventType: event.type }, 'Unhandled TrueLayer webhook event')
      }

      // Always return 200 to TrueLayer to acknowledge receipt
      return reply.status(200).send({ received: true })
    },
  )

  // ── POST /webhooks/veriff — KYC verification decisions ──────────────────
  // Veriff sends decision webhooks after completing identity verification
  app.post(
    '/veriff',
    { config: { rawBody: true } },
    async (request, reply) => {
      const signature = request.headers['x-hmac-signature'] as string | undefined

      if (!signature) {
        app.log.warn('Veriff webhook missing signature header')
        return reply.status(400).send({ error: 'Missing signature header' })
      }

      const rawBody = (request as unknown as { rawBody: string }).rawBody ?? ''

      const isValid = kycService.verifyWebhookSignature(rawBody, signature)
      if (!isValid) {
        app.log.warn({ headers: request.headers }, 'Veriff webhook signature verification failed')
        return reply.status(401).send({ error: 'Invalid webhook signature' })
      }

      const payload = request.body as {
        id?:         string
        feature?:    string
        code?:       number
        action?:     string
        vendorData?: string
        verification?: {
          id?:       string
          code?:     number
          person?:   { firstName?: string; lastName?: string }
          status?:   string
          reason?:   string
        }
      }

      const sessionId = payload.verification?.id ?? payload.id
      const code      = payload.verification?.code ?? payload.code

      if (!sessionId) {
        app.log.warn('Veriff webhook: missing session ID')
        return reply.status(200).send({ received: true })
      }

      app.log.info({ sessionId, code, action: payload.action }, 'Veriff webhook received')

      // Find user by Veriff session ID (stored in kycApplicantId)
      const user = await db.query.users.findFirst({
        where: eq(users.kycApplicantId, sessionId),
      })

      if (!user) {
        app.log.warn({ sessionId }, 'Veriff webhook: no user found for session ID')
        return reply.status(200).send({ received: true })
      }

      // Map Veriff decision codes to our KYC status
      // 9001 = approved, 9102 = declined, 9103 = resubmission requested,
      // 9104 = expired, 9121 = abandoned
      const kycStatus =
        code === 9001 ? 'approved' :
        code === 9102 ? 'declined' :
        'in_progress'

      await db
        .update(users)
        .set({ kycStatus, updatedAt: new Date() })
        .where(eq(users.id, user.id))

      await writeAuditEvent({
        eventType:  'kyc_completed',
        entityType: 'user',
        entityId:   user.id,
        userId:     user.id,
        actorType:  'webhook',
        actorId:    'veriff',
        metadata:   { sessionId, code, kycStatus },
      })

      app.log.info({ userId: user.id, kycStatus }, 'KYC status updated from Veriff webhook')

      return reply.status(200).send({ received: true })
    },
  )

  // ── POST /webhooks/stripe — Stripe Checkout payment completion ──────────
  // Only registered if Stripe is configured. Handles checkout.session.completed
  // to mark the Bolster payment as settled.
  //
  // Stripe's signature verification needs the raw request bytes. We wrap this
  // route in its own Fastify plugin so the custom content-type parser only
  // applies here and doesn't affect any other route.
  if (env.STRIPE_WEBHOOK_SECRET) {
    await app.register(async function stripeWebhookPlugin(scope) {
      // Override the JSON parser for this scope only — collect raw bytes
      // into a Buffer on the request, then parse JSON as normal for the body.
      scope.addContentTypeParser(
        'application/json',
        { parseAs: 'buffer' },
        (_req, body, done) => {
          done(null, body)
        },
      )

      scope.post('/stripe', async (request, reply) => {
        const signature = request.headers['stripe-signature'] as string | undefined

        if (!signature) {
          return reply.status(400).send({ error: 'Missing stripe-signature header' })
        }

        // body is a raw Buffer thanks to the custom parser above
        const rawBody = request.body as Buffer

        let event
        try {
          event = stripeService.constructWebhookEvent(rawBody, signature)
        } catch (e) {
          app.log.warn(
            { error: e instanceof Error ? e.message : String(e) },
            'Stripe webhook signature verification failed',
          )
          return reply.status(401).send({ error: 'Invalid webhook signature' })
        }

        app.log.info({ eventType: event.type, eventId: event.id }, 'Stripe webhook received')

        if (event.type === 'checkout.session.completed') {
          const session = event.data.object
          const bolsterPaymentId = session.metadata?.bolsterPaymentId

          if (bolsterPaymentId) {
            await paymentService.handleStripeSettled(bolsterPaymentId)
          } else {
            app.log.warn({ sessionId: session.id }, 'Stripe checkout completed but missing bolsterPaymentId metadata')
          }
        }

        return reply.status(200).send({ received: true })
      })
    })
  }
}
