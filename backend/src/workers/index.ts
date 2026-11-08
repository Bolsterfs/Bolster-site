import { Worker, Queue, type Job } from 'bullmq'
import IORedis from 'ioredis'
import { env } from '../config/env.js'
import { paymentService } from '../services/payment/payment.service.js'

// ── Job type definitions ──────────────────────────────────────────────────────

export interface PaymentSettledJob {
  type:              'payment_settled'
  truelayerPaymentId: string
}

export interface PaymentFailedJob {
  type:       'payment_failed'
  paymentId:  string
  reason?:    string
}

export interface SendEmailJob {
  type:      'send_email'
  to:        string
  template:  'payment_confirmation' | 'payment_failed' | 'kyc_approved' | 'invite_created'
  data:      Record<string, unknown>
}

export type PaymentJobData     = PaymentSettledJob | PaymentFailedJob
export type NotificationJobData = SendEmailJob

// ── Redis connection + queues + workers ───────────────────────────────────────
// Wrapped in try/catch so the server can start without Redis.
// When Redis is unavailable, queues and workers are null and job
// enqueuing is a no-op.

let connection:         IORedis | null         = null
let paymentQueue:       Queue | null           = null
let notificationQueue:  Queue | null           = null
let paymentWorker:      Worker | null          = null
let notificationWorker: Worker | null          = null

try {
  connection = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null, // required by BullMQ
    lazyConnect: true,
  })

  await connection.connect()

  // ── Queue definitions ───────────────────────────────────────────────────

  paymentQueue = new Queue('payments', {
    connection,
    defaultJobOptions: {
      attempts:  3,
      backoff: {
        type:  'exponential',
        delay: 2000, // 2s, 4s, 8s
      },
      removeOnComplete: { count: 100 },
      removeOnFail:     { count: 500 },
    },
  })

  notificationQueue = new Queue('notifications', {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: { count: 50 },
      removeOnFail:     { count: 200 },
    },
  })

  // ── Payment worker ──────────────────────────────────────────────────────

  paymentWorker = new Worker<PaymentJobData>(
    'payments',
    async (job: Job<PaymentJobData>) => {
      const { data } = job

      switch (data.type) {
        case 'payment_settled':
          await paymentService.handlePaymentSettled(data.truelayerPaymentId)
          break

        case 'payment_failed':
          console.warn(`Payment failed: ${data.paymentId}`, { reason: data.reason })
          if (notificationQueue) {
            await notificationQueue.add('send_email', {
              type:     'send_email',
              to:       'recipient@example.com', // fetch from payment record
              template: 'payment_failed',
              data:     { paymentId: data.paymentId },
            } satisfies SendEmailJob)
          }
          break

        default:
          console.warn('Unknown payment job type:', (data as { type: string }).type)
      }
    },
    {
      connection,
      concurrency: 5,
    },
  )

  paymentWorker.on('completed', (job) => {
    console.log(`Payment job ${job.id} completed`)
  })

  paymentWorker.on('failed', (job, err) => {
    console.error(`Payment job ${job?.id} failed:`, err.message)
  })

  // ── Notification worker ─────────────────────────────────────────────────

  notificationWorker = new Worker<NotificationJobData>(
    'notifications',
    async (job: Job<NotificationJobData>) => {
      const { data } = job

      if (data.type === 'send_email') {
        // TODO: integrate SendGrid
        console.log(`[NOTIFICATION] Email to ${data.to} — template: ${data.template}`, data.data)
      }
    },
    { connection, concurrency: 10 },
  )

  console.log('✅ Redis connected — background job processing enabled')
} catch (e) {
  console.warn(
    '⚠️  Redis unavailable — background job processing disabled.',
    e instanceof Error ? e.message : String(e),
  )
  // Clean up partial connection
  connection?.disconnect()
  connection = null
}

export { paymentQueue, notificationQueue }

// ── Graceful shutdown ─────────────────────────────────────────────────────────

export async function closeWorkers(): Promise<void> {
  await Promise.all([
    paymentWorker?.close(),
    notificationWorker?.close(),
    connection?.quit(),
  ].filter(Boolean))
}
