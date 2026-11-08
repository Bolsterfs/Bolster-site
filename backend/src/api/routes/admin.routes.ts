import type { FastifyInstance } from 'fastify'
import { desc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../db/client.js'
import { creditors, creditorRequests, users } from '../../db/schema/index.js'
import { authenticate, requireAdmin } from '../hooks/auth.hook.js'
import { creditorImportSchema } from '../../types/index.js'
import type { JwtPayload } from '../../types/index.js'
import { normaliseCreditorName } from '../../services/creditor/creditor.service.js'
import { notificationService } from '../../services/notification/notification.service.js'
import { writeAuditEvent } from '../../utils/audit.js'
import { env } from '../../config/env.js'

/**
 * Admin routes — Bolster staff only (see ADMIN_EMAILS in backend/.env).
 *
 * Today this covers the creditor-request queue: recipients ask for a creditor
 * that is not on the vetted list, and staff either add it (recording who
 * verified the bank details and how — the same evidence the import script
 * demands) or decline it. The recipient gets an email either way.
 *
 * Every route is behind authenticate + requireAdmin. Responses here MAY include
 * the requesting recipient's name and email because staff need to reply to them.
 */
export async function adminRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate)
  app.addHook('onRequest', requireAdmin)

  // ── GET /api/v1/admin/me — "am I an admin?" (the hooks above answer that) ──
  app.get('/me', async (request, reply) => {
    const user = request.user as JwtPayload
    return reply.send({ success: true, data: { email: user.email, isAdmin: true } })
  })

  // ── GET /api/v1/admin/creditor-requests?status=open|resolved|all ───────────
  app.get<{ Querystring: { status?: string } }>('/creditor-requests', async (request, reply) => {
    const status = request.query.status ?? 'open'
    const statuses =
      status === 'all'      ? ['open', 'added', 'declined'] :
      status === 'resolved' ? ['added', 'declined'] :
                              ['open']

    const rows = await db
      .select({
        id:             creditorRequests.id,
        creditorName:   creditorRequests.creditorName,
        note:           creditorRequests.note,
        status:         creditorRequests.status,
        createdAt:      creditorRequests.createdAt,
        updatedAt:      creditorRequests.updatedAt,
        requesterName:  users.firstName,
        requesterEmail: users.email,
      })
      .from(creditorRequests)
      .innerJoin(users, eq(users.id, creditorRequests.userId))
      .where(inArray(creditorRequests.status, statuses))
      .orderBy(desc(creditorRequests.createdAt))

    // How many other open requests ask for the same creditor — a strong hint
    // about which to add first.
    const openCounts = new Map<string, number>()
    const open = await db
      .select({ creditorName: creditorRequests.creditorName })
      .from(creditorRequests)
      .where(eq(creditorRequests.status, 'open'))
    for (const r of open) {
      const key = normaliseCreditorName(r.creditorName)
      openCounts.set(key, (openCounts.get(key) ?? 0) + 1)
    }

    return reply.send({
      success: true,
      data: rows.map((r) => ({
        ...r,
        othersAskingCount:
          r.status === 'open'
            ? Math.max(0, (openCounts.get(normaliseCreditorName(r.creditorName)) ?? 1) - 1)
            : 0,
      })),
    })
  })

  // ── POST /api/v1/admin/creditor-requests/:id/add-creditor ─────────────────
  // Adds the creditor to the vetted list, marks this request (and any other
  // open request for the same name) as added, and emails those recipients.
  app.post<{ Params: { id: string } }>('/creditor-requests/:id/add-creditor', async (request, reply) => {
    const admin = request.user as JwtPayload

    const req = await db.query.creditorRequests.findFirst({
      where: eq(creditorRequests.id, request.params.id),
    })
    if (!req) return reply.status(404).send({ success: false, error: 'Request not found' })
    if (req.status !== 'open') {
      return reply.status(409).send({ success: false, error: `This request was already ${req.status}` })
    }

    const body = creditorImportSchema.safeParse(request.body)
    if (!body.success) {
      const fieldErrors = body.error.flatten().fieldErrors
      const first = Object.values(fieldErrors).flat()[0]
      return reply.status(400).send({ success: false, error: first ?? 'Check the form', details: fieldErrors })
    }
    const c = body.data

    const clash = await db.query.creditors.findFirst({ where: eq(creditors.name, c.name) })
    if (clash) {
      return reply.status(409).send({
        success: false,
        error:   `A creditor called "${clash.name}" already exists.`,
        code:    'CREDITOR_EXISTS',
      })
    }

    const now = new Date()
    const [created] = await db
      .insert(creditors)
      .values({
        name:             c.name,
        category:         c.category,
        aliases:          c.aliases,
        sortCode:         c.sortCode,
        accountNumber:    c.accountNumber,
        referenceLabel:   c.referenceLabel,
        referenceHint:    c.referenceHint ?? null,
        isActive:         true,
        isTestData:       false,
        verifiedAt:       now,
        verifiedBy:       c.verifiedBy,
        verificationNote: c.verificationNote,
        updatedAt:        now,
      })
      .returning({ id: creditors.id, name: creditors.name })
    if (!created) return reply.status(500).send({ success: false, error: 'Could not add the creditor' })

    await writeAuditEvent({
      eventType:  'creditor_added',
      entityType: 'creditor',
      entityId:   created.id,
      userId:     admin.sub,
      actorType:  'user',
      actorId:    admin.sub,
      metadata:   { name: created.name, verifiedBy: c.verifiedBy, fromRequestId: req.id },
    })

    // Resolve this request plus any other open ones asking for the same creditor
    const wanted = normaliseCreditorName(req.creditorName)
    const openRequests = await db
      .select({
        id:           creditorRequests.id,
        creditorName: creditorRequests.creditorName,
        email:        users.email,
        firstName:    users.firstName,
      })
      .from(creditorRequests)
      .innerJoin(users, eq(users.id, creditorRequests.userId))
      .where(eq(creditorRequests.status, 'open'))

    const matching = openRequests.filter(
      (r) => r.id === req.id || normaliseCreditorName(r.creditorName) === wanted,
    )
    await db
      .update(creditorRequests)
      .set({ status: 'added', updatedAt: now })
      .where(inArray(creditorRequests.id, matching.map((r) => r.id)))

    for (const r of matching) {
      await notificationService.sendEmail({
        to:      r.email,
        subject: `${created.name} is now on Bolster`,
        text:
`Hi ${r.firstName},

You asked us to add ${r.creditorName} to Bolster. It's now on the list as "${created.name}".

Log in, choose "Add a debt", pick ${created.name} and enter your reference and the amount — then you can invite people to help.

${env.APP_URL}/dashboard/debts/new

The Bolster team`,
      })
    }

    return reply.send({
      success: true,
      data: { creditorId: created.id, name: created.name, resolvedRequests: matching.length },
    })
  })

  // ── POST /api/v1/admin/creditor-requests/:id/decline ──────────────────────
  app.post<{ Params: { id: string } }>('/creditor-requests/:id/decline', async (request, reply) => {
    const admin = request.user as JwtPayload
    const body = z.object({ reason: z.string().trim().min(5).max(500) }).safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ success: false, error: 'Give the recipient a short reason (5–500 characters)' })
    }

    const rows = await db
      .select({
        id:           creditorRequests.id,
        creditorName: creditorRequests.creditorName,
        status:       creditorRequests.status,
        email:        users.email,
        firstName:    users.firstName,
      })
      .from(creditorRequests)
      .innerJoin(users, eq(users.id, creditorRequests.userId))
      .where(eq(creditorRequests.id, request.params.id))
    const req = rows[0]
    if (!req) return reply.status(404).send({ success: false, error: 'Request not found' })
    if (req.status !== 'open') {
      return reply.status(409).send({ success: false, error: `This request was already ${req.status}` })
    }

    const now = new Date()
    await db
      .update(creditorRequests)
      .set({ status: 'declined', updatedAt: now })
      .where(eq(creditorRequests.id, req.id))

    await writeAuditEvent({
      eventType:  'creditor_request_declined',
      entityType: 'creditor_request',
      entityId:   req.id,
      userId:     admin.sub,
      actorType:  'user',
      actorId:    admin.sub,
      metadata:   { creditorName: req.creditorName, reason: body.data.reason },
    })

    await notificationService.sendEmail({
      to:      req.email,
      subject: `About your request to add ${req.creditorName}`,
      text:
`Hi ${req.firstName},

Thanks for asking us to add ${req.creditorName}. We can't add it at the moment:

${body.data.reason}

If you think we've got this wrong, reply to this email or contact support@bolsterfs.co.uk.

The Bolster team`,
    })

    return reply.send({ success: true, data: { id: req.id, status: 'declined' } })
  })
}
