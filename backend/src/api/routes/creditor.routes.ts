import type { FastifyInstance } from 'fastify'
import { db } from '../../db/client.js'
import { creditorRequests } from '../../db/schema/index.js'
import { creditorSearchSchema, creditorRequestSchema } from '../../types/index.js'
import { authenticate, requireKyc } from '../hooks/auth.hook.js'
import { creditorService } from '../../services/creditor/creditor.service.js'
import { notificationService } from '../../services/notification/notification.service.js'
import { writeAuditEvent } from '../../utils/audit.js'
import type { JwtPayload } from '../../types/index.js'

export async function creditorRoutes(app: FastifyInstance) {
  // Same access as debts: signed in and identity verified
  app.addHook('onRequest', authenticate)
  app.addHook('onRequest', requireKyc)

  // ── GET /api/v1/creditors?q= — the vetted list a recipient picks from ─────
  // Never returns sort codes or account numbers.
  app.get('/', async (request, reply) => {
    const query = creditorSearchSchema.safeParse(request.query)
    if (!query.success) {
      return reply.status(400).send({ success: false, error: 'Invalid search' })
    }
    const list = await creditorService.list(query.data.q)
    return reply.send({ success: true, data: list })
  })

  // ── POST /api/v1/creditors/requests — "my creditor isn't listed" ─────────
  // Records the request and tells the Bolster team. No debt is created: a
  // creditor can only be paid once Bolster has verified its bank details.
  app.post('/requests', {
    config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
  }, async (request, reply) => {
    const user = request.user as JwtPayload

    const body = creditorRequestSchema.safeParse(request.body)
    if (!body.success) {
      const fieldErrors = body.error.flatten().fieldErrors
      return reply.status(400).send({
        success: false,
        error:   fieldErrors.creditorName?.[0] ?? 'Invalid request',
        details: fieldErrors,
      })
    }

    // If it is actually on the list already, say so rather than filing a request
    const already = await creditorService.matchByName(body.data.creditorName)
    if (already) {
      return reply.status(409).send({
        success: false,
        error:   `${already.name} is already on our list — search for it by that name.`,
        code:    'CREDITOR_ALREADY_LISTED',
        data:    { creditor: already },
      })
    }

    const [created] = await db
      .insert(creditorRequests)
      .values({
        userId:       user.sub,
        creditorName: body.data.creditorName,
        note:         body.data.note ?? null,
      })
      .returning()

    if (!created) {
      return reply.status(500).send({ success: false, error: 'Could not record your request' })
    }

    await writeAuditEvent({
      eventType:  'creditor_requested',
      entityType: 'creditor_request',
      entityId:   created.id,
      userId:     user.sub,
      actorType:  'user',
      actorId:    user.sub,
      metadata:   { creditorName: created.creditorName },
      ipAddress:  request.ip,
    })

    // Let the team know there is a creditor to verify (best-effort)
    void notificationService.sendCreditorRequestToTeam({
      creditorName:   created.creditorName,
      note:           created.note,
      requestedBy:    user.email,
      requestId:      created.id,
    })

    return reply.status(201).send({
      success: true,
      data: { id: created.id, creditorName: created.creditorName, status: created.status },
    })
  })
}
