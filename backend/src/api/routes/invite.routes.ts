import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { invites } from '../../db/schema/index.js'
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
        return reply.status(404).send({
          success: false,
          error:   result.error.message,
        })
      }

      const { invite, debts: eligibleDebts, recipient } = result.value

      // Filter debt data based on privacy level — never over-expose
      const publicDebts = eligibleDebts.map((d) => ({
        id: d.id,
        creditorName:
          invite.privacyLevel !== 'amount_only'
            ? d.creditorName
            : undefined,
        remainingAmountPence:
          invite.privacyLevel !== 'amount_only'
            ? d.totalAmountPence - d.paidAmountPence
            : undefined,
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
        },
      })
    },
  )

  // ── GET /api/v1/invites ───────────────────────────────────────────────────
  app.get('/', { preHandler: [authenticate, requireKyc] }, async (request, reply) => {
    const user = request.user as JwtPayload

    const userInvites = await db.query.invites.findMany({
      where: eq(invites.userId, user.sub),
      orderBy: (i, { desc }) => [desc(i.createdAt)],
      with: { debt: true },
    })

    return reply.send({ success: true, data: userInvites })
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
