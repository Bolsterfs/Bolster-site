import type { FastifyInstance } from 'fastify'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { debts } from '../../db/schema/index.js'
import { createDebtSchema } from '../../types/index.js'
import { authenticate, requireKyc } from '../hooks/auth.hook.js'
import { writeAuditEvent } from '../../utils/audit.js'
import type { JwtPayload } from '../../types/index.js'

export async function debtRoutes(app: FastifyInstance) {
  // All debt routes require authentication + KYC
  app.addHook('onRequest', authenticate)
  app.addHook('onRequest', requireKyc)

  // ── GET /api/v1/debts ─────────────────────────────────────────────────────
  app.get('/', async (request, reply) => {
    const user = request.user as JwtPayload

    const userDebts = await db.query.debts.findMany({
      where: and(
        eq(debts.userId, user.sub),
        isNull(debts.deletedAt),
      ),
      orderBy: (d, { desc }) => [desc(d.createdAt)],
    })

    return reply.send({ success: true, data: userDebts })
  })

  // ── POST /api/v1/debts ────────────────────────────────────────────────────
  app.post('/', async (request, reply) => {
    const user = request.user as JwtPayload

    const body = createDebtSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid debt data',
        details: body.error.flatten().fieldErrors,
      })
    }

    const {
      creditorName, creditorSortCode, creditorAccount,
      creditorRef, totalAmountPence,
    } = body.data

    // TODO: Confirmation of Payee (CoP) check on creditor account
    // For MVP, mark as unverified — background job will verify
    // In production: call Pay.UK CoP API before inserting
    const [debt] = await db
      .insert(debts)
      .values({
        userId:           user.sub,
        creditorName,
        creditorSortCode: creditorSortCode.replace(/-/g, ''),
        creditorAccount:  creditorAccount.replace(/\s/g, ''),
        creditorRef,
        totalAmountPence,
        copVerified:      false, // set to true after CoP check completes
      })
      .returning()

    if (!debt) {
      return reply.status(500).send({ success: false, error: 'Failed to create debt record' })
    }

    await writeAuditEvent({
      eventType:  'debt_linked',
      entityType: 'debt',
      entityId:   debt.id,
      userId:     user.sub,
      actorType:  'user',
      actorId:    user.sub,
      metadata: {
        creditorName,
        totalAmountPence,
        copVerified: false,
      },
      ipAddress: request.ip,
    })

    return reply.status(201).send({ success: true, data: debt })
  })

  // ── GET /api/v1/debts/:id ─────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const user = request.user as JwtPayload

    const debt = await db.query.debts.findFirst({
      where: and(
        eq(debts.id, request.params.id),
        eq(debts.userId, user.sub),
        isNull(debts.deletedAt),
      ),
    })

    if (!debt) {
      return reply.status(404).send({ success: false, error: 'Debt not found' })
    }

    return reply.send({ success: true, data: debt })
  })

  // ── DELETE /api/v1/debts/:id — soft delete ────────────────────────────────
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const user = request.user as JwtPayload

    const debt = await db.query.debts.findFirst({
      where: and(
        eq(debts.id, request.params.id),
        eq(debts.userId, user.sub),
        isNull(debts.deletedAt),
      ),
    })

    if (!debt) {
      return reply.status(404).send({ success: false, error: 'Debt not found' })
    }

    await db
      .update(debts)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(debts.id, debt.id))

    return reply.send({ success: true })
  })
}
