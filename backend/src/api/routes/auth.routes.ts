import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcrypt'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { users, refreshTokens, passwordResetTokens } from '../../db/schema/index.js'
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  validateResetTokenSchema,
  resetPasswordSchema,
} from '../../types/index.js'
import { env } from '../../config/env.js'
import { writeAuditEvent } from '../../utils/audit.js'
import { notificationService } from '../../services/notification/notification.service.js'
import crypto from 'crypto'

const SALT_ROUNDS = 12

// Password reset links are single-use and short-lived.
const RESET_TOKEN_TTL_MINUTES = 30
const RESET_LINK_INVALID = 'This reset link is invalid or has expired. Please request a new one.'

function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex')
}

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

  // ── POST /api/v1/auth/forgot-password ─────────────────────────────────────
  // Always answers the same way whether or not the email has an account, so
  // this endpoint cannot be used to discover who is registered.
  app.post('/forgot-password', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const body = forgotPasswordSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ success: false, error: 'Please enter a valid email address' })
    }

    const user = await db.query.users.findFirst({
      where: eq(users.email, body.data.email.toLowerCase()),
    })

    if (user && user.isActive && !user.deletedAt) {
      const rawToken = crypto.randomBytes(32).toString('base64url')
      const now       = new Date()
      const expiresAt = new Date(now.getTime() + RESET_TOKEN_TTL_MINUTES * 60_000)

      // A new link replaces any earlier ones — only the latest email works.
      await db
        .update(passwordResetTokens)
        .set({ usedAt: now, updatedAt: now })
        .where(and(
          eq(passwordResetTokens.userId, user.id),
          isNull(passwordResetTokens.usedAt),
        ))

      await db.insert(passwordResetTokens).values({
        userId:    user.id,
        tokenHash: hashToken(rawToken),
        expiresAt,
      })

      await writeAuditEvent({
        eventType:  'password_reset_requested',
        entityType: 'user',
        entityId:   user.id,
        userId:     user.id,
        actorType:  'user',
        ipAddress:  request.ip,
        userAgent:  request.headers['user-agent'],
      })

      // Not awaited: sending must not slow the response for real accounts
      // (which would reveal they exist). sendEmail never throws.
      void notificationService.sendPasswordResetEmail({
        email:            user.email,
        firstName:        user.firstName,
        resetUrl:         `${env.APP_URL}/reset-password?token=${rawToken}`,
        expiresInMinutes: RESET_TOKEN_TTL_MINUTES,
      })
    }

    return reply.send({
      success: true,
      data: {
        message: 'If an account exists for that email address, we have sent a link to reset your password.',
      },
    })
  })

  // ── POST /api/v1/auth/reset-password/validate ─────────────────────────────
  // Lets the reset page tell someone their link has expired BEFORE they type
  // a new password, rather than after.
  app.post('/reset-password/validate', {
    config: { rateLimit: { max: 20, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const body = validateResetTokenSchema.safeParse(request.body)
    if (!body.success) {
      return reply.send({ success: true, data: { valid: false } })
    }

    const stored = await db.query.passwordResetTokens.findFirst({
      where: eq(passwordResetTokens.tokenHash, hashToken(body.data.token)),
    })

    const valid = Boolean(stored && !stored.usedAt && new Date() <= stored.expiresAt)
    return reply.send({ success: true, data: { valid } })
  })

  // ── POST /api/v1/auth/reset-password ──────────────────────────────────────
  app.post('/reset-password', {
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const body = resetPasswordSchema.safeParse(request.body)
    if (!body.success) {
      const fieldErrors = body.error.flatten().fieldErrors
      if (fieldErrors.token) {
        return reply.status(400).send({
          success: false,
          error:   RESET_LINK_INVALID,
          code:    'RESET_LINK_INVALID',
        })
      }
      return reply.status(400).send({
        success: false,
        error:   fieldErrors.password?.[0] ?? 'Invalid password',
        details: fieldErrors,
      })
    }

    const { token, password } = body.data
    const now = new Date()

    const stored = await db.query.passwordResetTokens.findFirst({
      where: eq(passwordResetTokens.tokenHash, hashToken(token)),
    })

    const user = stored && !stored.usedAt && now <= stored.expiresAt
      ? await db.query.users.findFirst({ where: eq(users.id, stored.userId) })
      : undefined

    if (!stored || !user || !user.isActive || user.deletedAt) {
      return reply.status(400).send({
        success: false,
        error:   RESET_LINK_INVALID,
        code:    'RESET_LINK_INVALID',
      })
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)

    // One transaction: claim the token, change the password and sign out every
    // existing session. Claiming with "usedAt IS NULL" means two simultaneous
    // requests with the same link cannot both succeed.
    const changed = await db.transaction(async (tx) => {
      const claimed = await tx
        .update(passwordResetTokens)
        .set({ usedAt: now, updatedAt: now })
        .where(and(
          eq(passwordResetTokens.id, stored.id),
          isNull(passwordResetTokens.usedAt),
        ))
        .returning({ id: passwordResetTokens.id })

      if (claimed.length === 0) return false

      await tx
        .update(users)
        .set({ passwordHash, updatedAt: now })
        .where(eq(users.id, user.id))

      await tx
        .update(refreshTokens)
        .set({ revokedAt: now })
        .where(and(
          eq(refreshTokens.userId, user.id),
          isNull(refreshTokens.revokedAt),
        ))

      return true
    })

    if (!changed) {
      return reply.status(400).send({
        success: false,
        error:   RESET_LINK_INVALID,
        code:    'RESET_LINK_INVALID',
      })
    }

    await writeAuditEvent({
      eventType:  'password_reset_completed',
      entityType: 'user',
      entityId:   user.id,
      userId:     user.id,
      actorType:  'user',
      actorId:    user.id,
      ipAddress:  request.ip,
      userAgent:  request.headers['user-agent'],
    })

    // Alert the account holder in case it wasn't them (best-effort).
    void notificationService.sendPasswordChangedEmail({
      email:     user.email,
      firstName: user.firstName,
    })

    return reply.send({
      success: true,
      data: { message: 'Your password has been updated. You can now sign in.' },
    })
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
