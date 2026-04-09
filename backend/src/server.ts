import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import { env } from './config/env.js'
import { checkDatabaseConnection } from './db/client.js'
import { authRoutes } from './api/routes/auth.routes.js'
import { debtRoutes } from './api/routes/debt.routes.js'
import { inviteRoutes } from './api/routes/invite.routes.js'
import { paymentRoutes } from './api/routes/payment.routes.js'
import { webhookRoutes } from './api/routes/webhook.routes.js'
import { healthRoutes } from './api/routes/health.routes.js'

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
await server.register(inviteRoutes,  { prefix: '/api/v1/invites' })
await server.register(paymentRoutes, { prefix: '/api/v1/payments' })
await server.register(webhookRoutes, { prefix: '/webhooks' })  // no auth — signature verified per-handler

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

  try {
    const port = 3001
    await server.listen({ port, host: '0.0.0.0' })
    server.log.info(`Bolster backend running on port ${port} [${env.NODE_ENV}]`)
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}

start()

// ── Graceful shutdown ─────────────────────────────────────────────────────────

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    server.log.info(`${signal} received — shutting down gracefully`)
    await server.close()
    process.exit(0)
  })
}
