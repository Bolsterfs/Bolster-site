import type { FastifyRequest, FastifyReply } from 'fastify'
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

// Extend FastifyRequest to include typed user payload
declare module 'fastify' {
  interface FastifyRequest {
    user: JwtPayload
  }
}
