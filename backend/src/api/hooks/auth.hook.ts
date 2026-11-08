import type { FastifyRequest, FastifyReply } from 'fastify'
import { eq } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { users } from '../../db/schema/index.js'
import { env } from '../../config/env.js'
import type { JwtPayload } from '../../types/index.js'

/**
 * Authentication hook — verifies JWT on every protected route.
 *
 * Usage in route files:
 *   app.addHook('onRequest', authenticate)
 *
 * Attaches verified payload to request.user so routes can access it.
 */
export async function authenticate(
  request: FastifyRequest,
  reply:   FastifyReply,
): Promise<void> {
  try {
    await request.jwtVerify()
  } catch {
    return reply.status(401).send({
      success: false,
      error:   'Authentication required',
      code:    'UNAUTHORIZED',
    })
  }
}

/**
 * KYC gate — requires recipient to have passed identity verification.
 * Apply AFTER authenticate on routes that create invites or manage debts.
 */
export async function requireKyc(
  request: FastifyRequest,
  reply:   FastifyReply,
): Promise<void> {
  const user = request.user as JwtPayload
  if (user.kycStatus !== 'approved') {
    return reply.status(403).send({
      success: false,
      error:   'Identity verification required before using this feature',
      code:    'KYC_REQUIRED',
      data:    { kycStatus: user.kycStatus },
    })
  }
}


/**
 * Admin gate — the signed-in user's CURRENT email (from the database, not the
 * token, so a change takes effect at once) must be listed in ADMIN_EMAILS.
 * Apply AFTER authenticate. Answers 403 with no hint about who is an admin.
 */
export async function requireAdmin(
  request: FastifyRequest,
  reply:   FastifyReply,
): Promise<void> {
  const payload = request.user as JwtPayload
  const user = await db.query.users.findFirst({
    where:   eq(users.id, payload.sub),
    columns: { email: true },
  })
  if (!user || !env.ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    return reply.status(403).send({
      success: false,
      error:   'Not available',
      code:    'FORBIDDEN',
    })
  }
}
