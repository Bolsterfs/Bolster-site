import type { FastifyInstance } from 'fastify'
import { checkDatabaseConnection } from '../../db/client.js'

export async function healthRoutes(app: FastifyInstance) {
  app.get('/', async (_request, reply) => {
    const dbOk = await checkDatabaseConnection()
    const status = dbOk ? 200 : 503
    return reply.status(status).send({
      status: dbOk ? 'ok' : 'degraded',
      db:     dbOk ? 'connected' : 'disconnected',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    })
  })
}
