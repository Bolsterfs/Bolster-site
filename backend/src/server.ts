import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import { env } from './config/env.js'
import { checkDatabaseConnection } from './db/client.js'
import { authRoutes } from './api/routes/auth.routes.js'
import { debtRoutes } from './api/routes/debt.routes.js'
import { inviteRoutes } from './api/routes/invite.routes.js'
import { kycRoutes } from './api/routes/kyc.routes.js'
import { paymentRoutes } from './api/routes/payment.routes.js'
import { webhookRoutes } from './api/routes/webhook.routes.js'
import { healthRoutes } from './api/routes/health.routes.js'
import { devRoutes } from './api/routes/dev.routes.js'
import { creditorRoutes } from './api/routes/creditor.routes.js'
import { adminRoutes } from './api/routes/admin.routes.js'
import { ensureTestCreditors } from './db/test-creditors.js'
import { paymentService } from './services/payment/payment.service.js'

const server = Fastify({
  logger: {
    level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    ...(env.NODE_ENV !== 'production' && {
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss' },
      },
    }),
  },
  trustProxy: true,  // ECS Fargate sits behind ALB
})

// ── Plugins ───────────────────────────────────────────────────────────────────

await server.register(cors, {
  origin: [env.APP_URL],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
})

await server.register(jwt, {
  secret: {
    private: env.JWT_ACCESS_SECRET,
    public:  env.JWT_ACCESS_SECRET,
  },
})

await server.register(rateLimit, {
  max:       100,
  timeWindow: '1 minute',
  // Tighter limits on auth endpoints handled per-route
})

// ── Routes ────────────────────────────────────────────────────────────────────

await server.register(healthRoutes,  { prefix: '/health' })
await server.register(authRoutes,    { prefix: '/api/v1/auth' })
await server.register(debtRoutes,    { prefix: '/api/v1/debts' })
await server.register(creditorRoutes, { prefix: '/api/v1/creditors' })
await server.register(kycRoutes,     { prefix: '/api/v1/kyc' })
await server.register(inviteRoutes,  { prefix: '/api/v1/invites' })
await server.register(paymentRoutes, { prefix: '/api/v1/payments' })
await server.register(adminRoutes,   { prefix: '/api/v1/admin' })   // staff only — see ADMIN_EMAILS
await server.register(webhookRoutes, { prefix: '/webhooks' })  // no auth — signature verified per-handler

if (env.NODE_ENV === 'development') {
  await server.register(devRoutes, { prefix: '/api/v1/dev' })
}

// ── Error handler ─────────────────────────────────────────────────────────────

server.setErrorHandler((error, _request, reply) => {
  server.log.error(error)

  // Don't leak internal errors to clients
  if (error.statusCode && error.statusCode < 500) {
    return reply.status(error.statusCode).send({
      success: false,
      error:   error.message,
      code:    error.code,
    })
  }

  return reply.status(500).send({
    success: false,
    error:   'Internal server error',
  })
})

// ── Start ─────────────────────────────────────────────────────────────────────

async function start() {
  // Verify database connection before accepting traffic
  const dbOk = await checkDatabaseConnection()
  if (!dbOk) {
    server.log.error('Cannot connect to database — exiting')
    process.exit(1)
  }

  // Development only: make sure the made-up test creditors exist so the
  // "Add a debt" screen has something to choose from. Never runs in production.
  if (env.NODE_ENV === 'development') {
    try {
      const created = await ensureTestCreditors()
      if (created > 0) server.log.info(`Added ${created} test creditor(s) for development`)
    } catch (e) {
      server.log.warn(
        { error: e instanceof Error ? e.message : String(e) },
        'Could not add test creditors — has the latest migration been run? (npm run db:migrate --workspace=backend)',
      )
    }
  }

  try {
    const port = 3001
    await server.listen({ port, host: '0.0.0.0' })
    server.log.info(`Bolster backend running on port ${port} [${env.NODE_ENV}]`)
    startStripeReconciliation()
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}

start()

// ── Stripe reconciliation sweep ───────────────────────────────────────────────
// Catches card payments whose webhook was missed, so they settle (or expire)
// instead of sitting as "pending" forever. Runs shortly after start-up, then
// on an interval. Skipped entirely when Stripe is not configured.

let reconcileTimer: NodeJS.Timeout | null = null

function startStripeReconciliation() {
  if (!env.STRIPE_SECRET_KEY) return

  const run = async () => {
    try {
      const r = await paymentService.reconcilePendingStripePayments()
      if (r.checked > 0) {
        server.log.info(
          { checked: r.checked, settled: r.settled, expired: r.expired, unknown: r.unknown },
          'Stripe reconciliation sweep',
        )
      }
    } catch (e) {
      server.log.warn({ error: e instanceof Error ? e.message : String(e) }, 'Stripe reconciliation sweep failed')
    }
  }

  // First pass 15s after boot (gives the DB/Stripe a moment), then every interval.
  setTimeout(run, 15_000).unref()
  reconcileTimer = setInterval(run, env.STRIPE_RECONCILE_INTERVAL_MS)
  reconcileTimer.unref()
  server.log.info(`Stripe reconciliation sweep every ${Math.round(env.STRIPE_RECONCILE_INTERVAL_MS / 1000)}s`)
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    server.log.info(`${signal} received — shutting down gracefully`)
    if (reconcileTimer) clearInterval(reconcileTimer)
    await server.close()
    process.exit(0)
  })
}
