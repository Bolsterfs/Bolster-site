import type { FastifyInstance } from 'fastify'
import { eq, and } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { debts, invites, users } from '../../db/schema/index.js'
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

    // Seed realistic UK debts
    const seedDebts = [
      { creditorName: 'British Gas',  sortCode: '200000', account: '31510604', ref: 'BG-ELEC-2024',   amountPence: 18400 },  // £184.00
      { creditorName: 'Barclays',     sortCode: '200000', account: '43219876', ref: 'BCARD-MIN-PAY',   amountPence: 275000 }, // £2,750.00
      { creditorName: 'Vodafone',     sortCode: '200000', account: '55512345', ref: 'VF-MOBILE-Q2',    amountPence: 8900 },   // £89.00
    ]

    const createdDebts = []

    for (const sd of seedDebts) {
      let debt = await db.query.debts.findFirst({
        where: and(
          eq(debts.userId, user.sub),
          eq(debts.creditorName, sd.creditorName),
        ),
      })

      if (!debt) {
        const [created] = await db
          .insert(debts)
          .values({
            userId:           user.sub,
            creditorName:     sd.creditorName,
            creditorSortCode: sd.sortCode,
            creditorAccount:  sd.account,
            creditorRef:      sd.ref,
            totalAmountPence: sd.amountPence,
            paidAmountPence:  0,
            status:           'active',
            copVerified:      true,
            copVerifiedAt:    new Date(),
          })
          .returning()
        debt = created
      }

      if (debt) createdDebts.push(debt)
    }

    if (createdDebts.length === 0) {
      return reply.status(500).send({ success: false, error: 'Failed to create test debts' })
    }

    // Find or create a user-level invite (no specific debt — contributor picks)
    let invite = await db.query.invites.findFirst({
      where: and(
        eq(invites.userId, user.sub),
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
          debtId:        null,
          privacyLevel:  'creditor_name',
          personalMessage: 'Hi, I could use a little help with one of my bills this month. Any amount helps 💙',
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
        debtIds: createdDebts.map(d => d.id),
        inviteUrl,
      },
    })
  })

  // ── POST /api/v1/dev/approve-kyc ──────────────────────────────────────────
  // Bypasses Veriff and sets the current user's KYC status to approved.
  app.post('/approve-kyc', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user as JwtPayload

    await db
      .update(users)
      .set({ kycStatus: 'approved', updatedAt: new Date() })
      .where(eq(users.id, user.sub))

    return reply.send({ success: true, data: { kycStatus: 'approved' } })
  })
}
