import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { users } from '../../db/schema/index.js'
import { truelayerService } from '../../services/payment/truelayer.js'
import { paymentService } from '../../services/payment/payment.service.js'
import { writeAuditEvent } from '../../utils/audit.js'
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

  // ── POST /webhooks/onfido — KYC check results ─────────────────────────────
  // Onfido sends check results here after completing identity verification
  app.post(
    '/onfido',
    async (request, reply) => {
      // Onfido sends HMAC-SHA256 signature in X-SHA2-Signature header
      const signature = request.headers['x-sha2-signature'] as string | undefined

      // TODO: Verify Onfido webhook signature using ONFIDO_WEBHOOK_TOKEN
      // For now, log and process (implement verification before production)
      if (!signature) {
        app.log.warn('Onfido webhook missing signature header')
      }

      const payload = request.body as {
        payload?: {
          resource_type?: string
          action?:        string
          object?: {
            id?:     string
            status?: string
            href?:   string
          }
        }
      }

      const { resource_type, action, object: obj } = payload.payload ?? {}

      if (resource_type === 'check' && obj?.id) {
        const checkId  = obj.id
        const checkStatus = obj.status

        app.log.info({ checkId, checkStatus, action }, 'Onfido check webhook received')

        if (action === 'check.completed') {
          // Find user by Onfido check ID
          const user = await db.query.users.findFirst({
            where: eq(users.kycCheckId, checkId),
          })

          if (user) {
            // Map Onfido result to our KYC status
            const kycStatus =
              checkStatus === 'complete' ? 'approved' :
              checkStatus === 'withdrawn' ? 'declined' :
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
              actorId:    'onfido',
              metadata:   { checkId, checkStatus, kycStatus },
            })

            app.log.info({ userId: user.id, kycStatus }, 'KYC status updated from Onfido webhook')
          } else {
            app.log.warn({ checkId }, 'Onfido webhook: no user found for check ID')
          }
        }
      }

      return reply.status(200).send({ received: true })
    },
  )
}
