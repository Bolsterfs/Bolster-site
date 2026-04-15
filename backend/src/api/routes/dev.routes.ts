import type { FastifyInstance } from 'fastify'
import { eq, and } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { debts, invites } from '../../db/schema/index.js'
import { authenticate } from '../hooks/auth.hook.js'
import { generateInviteToken } from '../../services/invite/invite.service.js'
import { env } from '../../config/env.js'
import type { JwtPayload } from '../../types/index.js'

/**
 * Development-only routes — seed test data, shortcuts, etc.
 * Only registered when NODE_ENV=development.
 * Returns 404 in production because the routes simply don't exist.
 */
export async function devRoutes(app: FastifyInstance) {

  // ── POST /api/v1/dev/seed ─────────────────────────────────────────────────
  // Creates a test debt (if none exists) and an active invite for it.
  // Requires authentication so the data is tied to the current user.
  app.post('/seed', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user as JwtPayload

    // Find or create a test debt for this user
    let debt = await db.query.debts.findFirst({
      where: and(
        eq(debts.userId, user.sub),
        eq(debts.creditorName, 'Test BNPL Provider'),
      ),
    })

    if (!debt) {
      const [created] = await db
        .insert(debts)
        .values({
          userId:           user.sub,
          creditorName:     'Test BNPL Provider',
          creditorSortCode: '040004',
          creditorAccount:  '00000000',
          creditorRef:      'BOLSTER-TEST',
          totalAmountPence: 15000,   // £150
          paidAmountPence:  0,
          status:           'active',
          copVerified:      true,
          copVerifiedAt:    new Date(),
        })
        .returning()
      debt = created
    }

    if (!debt) {
      return reply.status(500).send({ success: false, error: 'Failed to create test debt' })
    }

    // Find or create an active invite for the debt
    let invite = await db.query.invites.findFirst({
      where: and(
        eq(invites.debtId, debt.id),
        eq(invites.status, 'active'),
      ),
    })

    if (!invite) {
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 30)

      const [created] = await db
        .insert(invites)
        .values({
          token:         'pending',
          userId:        user.sub,
          debtId:        debt.id,
          privacyLevel:  'creditor_name',
          personalMessage: 'This is a test invite from Bolster dev tools.',
          expiresAt,
          status:        'active',
        })
        .returning()

      if (!created) {
        return reply.status(500).send({ success: false, error: 'Failed to create test invite' })
      }

      // Generate a signed token
      const token = generateInviteToken(created.id)
      await db
        .update(invites)
        .set({ token, updatedAt: new Date() })
        .where(eq(invites.id, created.id))

      invite = { ...created, token }
    }

    const inviteUrl = `${env.INVITE_BASE_URL}/${invite.token}`

    return reply.send({
      success: true,
      data: {
        debtId:    debt.id,
        inviteUrl,
      },
    })
  })
}
