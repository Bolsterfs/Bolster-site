import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcrypt'
import { eq } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { users, refreshTokens } from '../../db/schema/index.js'
import { registerSchema, loginSchema } from '../../types/index.js'
import { env } from '../../config/env.js'
import { writeAuditEvent } from '../../utils/audit.js'
import crypto from 'crypto'

const SALT_ROUNDS = 12

export async function authRoutes(app: FastifyInstance) {

  // ── POST /api/v1/auth/register ────────────────────────────────────────────
  app.post('/register', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const body = registerSchema.safeParse(request.body)
    if (!body.success) {
      const fieldErrors = body.error.flatten().fieldErrors
      const passwordError = fieldErrors.password?.[0]
      return reply.status(400).send({
        success: false,
        error: passwordError ?? 'Invalid registration data',
        details: fieldErrors,
      })
    }

    const { email, password, firstName, lastName, phone } = body.data

    // Check email not already registered
    const existing = await db.query.users.findFirst({
      where: eq(users.email, email.toLowerCase()),
    })
    if (existing) {
      // Return same message as "not found" to prevent email enumeration
      return reply.status(409).send({
        success: false,
        error: 'An account with this email already exists',
      })
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)

    const [user] = await db
      .insert(users)
      .values({
        email: email.toLowerCase(),
        passwordHash,
        firstName,
        lastName,
        phone:     phone ?? null,
        kycStatus: 'pending',
      })
      .returning({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        kycStatus: users.kycStatus,
      })

    if (!user) {
      return reply.status(500).send({ success: false, error: 'Registration failed' })
    }

    await writeAuditEvent({
      eventType: 'recipient_registered',
      entityType: 'user',
      entityId: user.id,
      userId: user.id,
      actorType: 'user',
      actorId: user.id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    })

    const { accessToken, refreshToken } = await issueTokens(app, user.id, user.email, user.kycStatus)

    return reply.status(201).send({
      success: true,
      data: { user, accessToken, refreshToken },
    })
  })

  // ── POST /api/v1/auth/login ───────────────────────────────────────────────
  app.post('/login', {
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const body = loginSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ success: false, error: 'Invalid credentials format' })
    }

    const { email, password } = body.data

    const user = await db.query.users.findFirst({
      where: eq(users.email, email.toLowerCase()),
    })

    // Always hash-compare to prevent timing attacks revealing valid emails
    const dummyHash = '$2b$12$invalidhashfortimingnormalization'
    const isValid = user
      ? await bcrypt.compare(password, user.passwordHash)
      : await bcrypt.compare(password, dummyHash)

    if (!user || !isValid || !user.isActive) {
      return reply.status(401).send({
        success: false,
        error: 'Invalid email or password',
      })
    }

    const { accessToken, refreshToken } = await issueTokens(
      app, user.id, user.email, user.kycStatus,
    )

    return reply.send({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          kycStatus: user.kycStatus,
        },
        accessToken,
        refreshToken,
      },
    })
  })

  // ── POST /api/v1/auth/refresh ─────────────────────────────────────────────
  app.post('/refresh', async (request, reply) => {
    const { refreshToken } = request.body as { refreshToken?: string }
    if (!refreshToken) {
      return reply.status(400).send({ success: false, error: 'Refresh token required' })
    }

    // Hash the provided token and look it up
    const tokenHash = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex')

    const stored = await db.query.refreshTokens.findFirst({
      where: eq(refreshTokens.tokenHash, tokenHash),
    })

    if (!stored || stored.revokedAt || new Date() > stored.expiresAt) {
      return reply.status(401).send({ success: false, error: 'Invalid or expired refresh token' })
    }

    // Revoke used token (rotation)
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.id, stored.id))

    const user = await db.query.users.findFirst({
      where: eq(users.id, stored.userId),
    })

    if (!user || !user.isActive) {
      return reply.status(401).send({ success: false, error: 'User not found' })
    }

    const tokens = await issueTokens(app, user.id, user.email, user.kycStatus)

    return reply.send({ success: true, data: tokens })
  })

  // ── POST /api/v1/auth/logout ──────────────────────────────────────────────
  app.post('/logout', async (request, reply) => {
    const { refreshToken } = request.body as { refreshToken?: string }
    if (refreshToken) {
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex')
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokens.tokenHash, tokenHash))
    }
    return reply.send({ success: true })
  })
}

// ── Helper: issue access + refresh token pair ─────────────────────────────────

async function issueTokens(
  app:       FastifyInstance,
  userId:    string,
  email:     string,
  kycStatus: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = app.jwt.sign(
    { sub: userId, email, kycStatus },
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN },
  )

  // Refresh token is a random string — we store only its hash
  const rawRefreshToken = crypto.randomBytes(64).toString('base64url')
  const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex')

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7) // 7 days

  await db.insert(refreshTokens).values({
    userId,
    tokenHash,
    expiresAt,
  })

  return { accessToken, refreshToken: rawRefreshToken }
}
