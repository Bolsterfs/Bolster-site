import type { FastifyInstance } from 'fastify'
import { eq, and, isNull, ne } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { debts } from '../../db/schema/index.js'
import { createDebtSchema, scanBillSchema } from '../../types/index.js'
import { authenticate, requireKyc } from '../hooks/auth.hook.js'
import { writeAuditEvent } from '../../utils/audit.js'
import { creditorService } from '../../services/creditor/creditor.service.js'
import { billScanService } from '../../services/bill/bill-scan.service.js'
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
        error: Object.values(body.error.flatten().fieldErrors)[0]?.[0] ?? 'Invalid debt data',
        details: body.error.flatten().fieldErrors,
      })
    }

    const { creditorId, creditorRef, totalAmountPence } = body.data

    // The creditor must be on Bolster's vetted list. Its name and bank details
    // are copied from there — the recipient never supplies them.
    const creditor = await creditorService.findUsableById(creditorId)
    if (!creditor) {
      return reply.status(400).send({
        success: false,
        error:   'That creditor is not available. Please choose one from the list.',
        code:    'CREDITOR_NOT_AVAILABLE',
      })
    }

    // Stop the same bill being added twice
    const duplicate = await db.query.debts.findFirst({
      where: and(
        eq(debts.userId, user.sub),
        eq(debts.creditorId, creditor.id),
        eq(debts.creditorRef, creditorRef),
        isNull(debts.deletedAt),
        ne(debts.status, 'resolved'),
      ),
    })
    if (duplicate) {
      return reply.status(409).send({
        success: false,
        error:   `You have already added a ${creditor.name} debt with this reference.`,
        code:    'DEBT_ALREADY_ADDED',
      })
    }

    const now = new Date()
    const [debt] = await db
      .insert(debts)
      .values({
        userId:           user.sub,
        creditorId:       creditor.id,
        creditorName:     creditor.name,
        creditorSortCode: creditor.sortCode,
        creditorAccount:  creditor.accountNumber,
        creditorRef,
        totalAmountPence,
        // Payee details come from the vetted list, so the debt is payable now
        copVerified:      true,
        copVerifiedAt:    now,
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
        creditorId:        creditor.id,
        creditorName:      creditor.name,
        totalAmountPence,
        payeeVerification: 'vetted_creditor_list',
        creditorVerifiedBy: creditor.verifiedBy,
        creditorIsTestData: creditor.isTestData,
      },
      ipAddress: request.ip,
    })

    return reply.status(201).send({ success: true, data: debt })
  })

  // ── GET /api/v1/debts/scan/status — is bill scanning switched on? ────────
  app.get('/scan/status', async (_request, reply) => {
    return reply.send({ success: true, data: { enabled: billScanService.isConfigured() } })
  })

  // ── POST /api/v1/debts/scan — read a bill to pre-fill the form ───────────
  // Takes a photo or PDF as base64, returns the creditor (matched against the
  // vetted list), amount and reference for the person to CHECK. Creates
  // nothing and stores nothing — the file is discarded after reading.
  app.post('/scan', {
    bodyLimit: 8 * 1024 * 1024,
    config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
  }, async (request, reply) => {
    const user = request.user as JwtPayload

    if (!billScanService.isConfigured()) {
      return reply.status(503).send({
        success: false,
        error:   'Bill scanning isn\u2019t available yet. Please add your debt using the list.',
        code:    'BILL_SCAN_NOT_CONFIGURED',
      })
    }

    const body = scanBillSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error:   Object.values(body.error.flatten().fieldErrors)[0]?.[0] ?? 'That file could not be read',
      })
    }

    const result = await billScanService.scan(body.data)

    if (!result.ok) {
      const unreadable = result.error.code === 'UNREADABLE'
      return reply.status(unreadable ? 422 : 503).send({
        success: false,
        error: unreadable
          ? 'We couldn\u2019t read that file. Try a clearer photo, or add your debt using the list.'
          : 'Bill scanning is busy right now. Please try again in a moment, or add your debt using the list.',
        code: unreadable ? 'BILL_UNREADABLE' : 'BILL_SCAN_UNAVAILABLE',
      })
    }

    // Record that a scan happened — never what the bill said
    await writeAuditEvent({
      eventType:  'bill_scanned',
      entityType: 'user',
      entityId:   user.sub,
      userId:     user.sub,
      actorType:  'user',
      actorId:    user.sub,
      metadata: {
        isBill:            result.value.isBill,
        matchedCreditorId: result.value.matchedCreditor?.id ?? null,
        mediaType:         body.data.mediaType,
      },
      ipAddress: request.ip,
    })

    return reply.send({ success: true, data: result.value })
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
