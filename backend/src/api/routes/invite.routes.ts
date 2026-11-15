import type { FastifyInstance } from 'fastify'
import { InviteUnavailableError } from '../../types/index.js'
import { neutralBillLabel } from '../../services/creditor/creditor.service.js'

import { env } from '../../config/env.js'
import { desc, eq, inArray } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { invites, creditors, debts } from '../../db/schema/index.js'
import { createInviteSchema } from '../../types/index.js'
import { authenticate, requireKyc } from '../hooks/auth.hook.js'
import { inviteService } from '../../services/invite/invite.service.js'
import type { JwtPayload } from '../../types/index.js'

export async function inviteRoutes(app: FastifyInstance) {

  // ── GET /api/v1/invites/resolve/:token — PUBLIC (no auth) ────────────────
  // Called when a contributor opens an invite link
  app.get<{ Params: { '*': string } }>(
    '/resolve/*',
    async (request, reply) => {
      const result = await inviteService.resolveInviteToken(
        request.params['*'],
        request.ip,
        request.headers['user-agent'],
      )

      if (!result.ok) {
        const e = result.error
        const unavailable = e instanceof InviteUnavailableError ? e : null
        return reply.status(unavailable && unavailable.code !== 'INVITE_INVALID' ? 410 : 404).send({
          success: false,
          error:   e.message,
          code:    unavailable?.code ?? 'INVITE_INVALID',
          data:    unavailable?.recipientFirstName
            ? { recipientFirstName: unavailable.recipientFirstName }
            : undefined,
        })
      }

      const { invite, debts: eligibleDebts, recipient } = result.value

      // Filter debt data based on privacy level — never over-expose.
      // 'amount_only' hides WHO is owed but always shows HOW MUCH is left: the
      // helper needs a figure to choose an amount, and the overpayment cap
      // depends on it. Without the creditor name we send a neutral label
      // ("Energy bill") so several bills can still be told apart.
      // Category comes from the vetted creditor row (legacy debts have none)
      const creditorIds = eligibleDebts.map((d) => d.creditorId).filter((id): id is string => !!id)
      const categoryById = new Map<string, string>()
      if (invite.privacyLevel === 'amount_only' && creditorIds.length > 0) {
        const rows = await db
          .select({ id: creditors.id, category: creditors.category })
          .from(creditors)
          .where(inArray(creditors.id, creditorIds))
        for (const r of rows) categoryById.set(r.id, r.category)
      }

      const publicDebts = eligibleDebts.map((d, i) => ({
        id: d.id,
        creditorName:
          invite.privacyLevel !== 'amount_only'
            ? d.creditorName
            : undefined,
        label:
          invite.privacyLevel !== 'amount_only'
            ? d.creditorName
            : neutralBillLabel(d.creditorId ? categoryById.get(d.creditorId) : null, i, eligibleDebts.length),
        remainingAmountPence: Math.max(0, d.totalAmountPence - d.paidAmountPence),
      }))

      return reply.send({
        success: true,
        data: {
          inviteId:           invite.id,
          privacyLevel:       invite.privacyLevel,
          personalMessage:    invite.personalMessage,
          recipientFirstName: recipient.firstName,
          debts:              publicDebts,
          inviteMaxAmountPence: invite.maxAmountPence,
          expiresAt:          invite.expiresAt,
          // How the contributor will pay, so the page wording is accurate
          paymentMethod:      env.ENABLE_PAYMENT_INITIATION ? 'bank_transfer' : 'card',
        },
      })
    },
  )

  // ── GET /api/v1/invites ───────────────────────────────────────────────────
  app.get('/', { preHandler: [authenticate, requireKyc] }, async (request, reply) => {
    const user = request.user as JwtPayload

    // Every invite the recipient has made, newest first, with the bill it was
    // for (null = a general invite where the helper chooses). The token is
    // included even for inactive invites so the recipient can see what a
    // helper sees if they open an old link.
    const rows = await db
      .select({
        id:              invites.id,
        token:           invites.token,
        debtId:          invites.debtId,
        creditorName:    debts.creditorName,
        privacyLevel:    invites.privacyLevel,
        personalMessage: invites.personalMessage,
        maxAmountPence:  invites.maxAmountPence,
        status:          invites.status,
        expiresAt:       invites.expiresAt,
        openCount:       invites.openCount,
        createdAt:       invites.createdAt,
        revokedAt:       invites.revokedAt,
      })
      .from(invites)
      .leftJoin(debts, eq(debts.id, invites.debtId))
      .where(eq(invites.userId, user.sub))
      .orderBy(desc(invites.createdAt))

    // An invite past its date but never opened since is still marked 'active'
    // in the table; report it as expired so the list is truthful.
    const now = Date.now()
    const data = rows.map((r) => ({
      ...r,
      status: r.status === 'active' && r.expiresAt.getTime() < now ? 'expired' : r.status,
    }))

    return reply.send({ success: true, data })
  })

  // ── POST /api/v1/invites ──────────────────────────────────────────────────
  app.post('/', { preHandler: [authenticate, requireKyc] }, async (request, reply) => {
    const user = request.user as JwtPayload

    const body = createInviteSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid invite data',
        details: body.error.flatten().fieldErrors,
      })
    }

    const result = await inviteService.createInvite(
      user.sub,
      body.data,
      request.ip,
    )

    if (!result.ok) {
      return reply.status(400).send({
        success: false,
        error: result.error.message,
      })
    }

    return reply.status(201).send({
      success: true,
      data: {
        invite:    result.value.invite,
        inviteUrl: result.value.inviteUrl,
      },
    })
  })

  // ── DELETE /api/v1/invites/:id — revoke ───────────────────────────────────
  app.delete<{
    Params: { id: string }
    Body:   { reason?: string }
  }>('/:id', { preHandler: [authenticate, requireKyc] }, async (request, reply) => {
    const user = request.user as JwtPayload

    const result = await inviteService.revokeInvite(
      request.params.id,
      user.sub,
      (request.body as { reason?: string }).reason,
    )

    if (!result.ok) {
      return reply.status(400).send({
        success: false,
        error: result.error.message,
      })
    }

    return reply.send({ success: true })
  })
}
