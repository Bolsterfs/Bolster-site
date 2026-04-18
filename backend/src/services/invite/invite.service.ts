import crypto from 'crypto'
import { eq, and } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { invites, debts, users } from '../../db/schema/index.js'
import type { Invite, Debt, User } from '../../db/schema/index.js'
import type { CreateInviteInput, Result } from '../../types/index.js'
import { ok, err } from '../../types/index.js'
import { env } from '../../config/env.js'
import { writeAuditEvent } from '../../utils/audit.js'

export interface InviteWithContext {
  invite:    Invite
  debt:      Debt | null              // null for user-level invites
  debts:     Debt[]                   // all eligible debts for user-level invites
  recipient: Pick<User, 'firstName' | 'lastName'>
}

// HMAC-SHA256 in base64url is always exactly 43 characters (256 bits / 6 bits per char,
// no padding). The separator between payload and signature is '-', which Fastify can
// match in route parameters. We use fixed-length slicing in verify rather than
// splitting on '-', because '-' also appears legitimately inside the base64url payload.
const SIGNATURE_B64URL_LENGTH = 43

/**
 * Generate a cryptographically secure, HMAC-signed invite token.
 * Format: {base64url(payload)}-{hmac_sha256_base64url}
 * The separator is '-' (not '.') so Fastify can match it in :token route params.
 */
export function generateInviteToken(inviteId: string): string {
  const payload   = `${inviteId}:${Date.now()}`
  const signature = crypto
    .createHmac('sha256', env.INVITE_SECRET)
    .update(payload)
    .digest('base64url')

  return `${Buffer.from(payload).toString('base64url')}-${signature}`
}

/**
 * Verify an invite token signature and extract the invite ID.
 * Returns null if the signature is invalid (tampered token).
 * Uses fixed-length slicing rather than a separator split, because '-' can also
 * appear in the base64url-encoded payload.
 */
export function verifyInviteToken(token: string): string | null {
  // Minimum viable token: 1 payload char + separator + 43 sig chars
  if (token.length < SIGNATURE_B64URL_LENGTH + 2) return null

  const providedSignature = token.slice(-SIGNATURE_B64URL_LENGTH)
  const encodedPayload    = token.slice(0, token.length - SIGNATURE_B64URL_LENGTH - 1)

  const payload           = Buffer.from(encodedPayload, 'base64url').toString()
  const expectedSignature = crypto
    .createHmac('sha256', env.INVITE_SECRET)
    .update(payload)
    .digest('base64url')

  // Timing-safe comparison to prevent timing attacks
  try {
    const sigMatch = crypto.timingSafeEqual(
      Buffer.from(providedSignature),
      Buffer.from(expectedSignature),
    )
    if (!sigMatch) return null
  } catch {
    return null
  }

  const inviteId = payload.split(':')[0]
  return inviteId ?? null
}

export class InviteService {
  /**
   * Create a new invite for a debt.
   * Prerequisites: recipient must be KYC-verified.
   */
  async createInvite(
    userId:  string,
    input:   CreateInviteInput,
    ipAddress?: string,
  ): Promise<Result<{ invite: Invite; inviteUrl: string }>> {
    // Verify user is KYC approved
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    })

    if (!user) {
      return err(new Error('User not found'))
    }

    if (user.kycStatus !== 'approved') {
      return err(new Error(
        `Identity verification required before creating invites. Current status: ${user.kycStatus}`,
      ))
    }

    // If a specific debt is provided, verify it belongs to this user
    if (input.debtId) {
      const debt = await db.query.debts.findFirst({
        where: and(
          eq(debts.id, input.debtId),
          eq(debts.userId, userId),
        ),
      })

      if (!debt) {
        return err(new Error('Debt not found or does not belong to you'))
      }

      if (debt.status === 'resolved') {
        return err(new Error('This debt has already been resolved'))
      }
    }

    // Calculate expiry
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + input.expiresInDays)

    // Create invite record first to get the ID
    const [invite] = await db
      .insert(invites)
      .values({
        token:           'pending', // temporary — updated below
        userId,
        debtId:          input.debtId ?? null,
        privacyLevel:    input.privacyLevel,
        personalMessage: input.personalMessage ?? null,
        maxAmountPence:  input.maxAmountPence  ?? null,
        expiresAt,
        status:          'active',
      })
      .returning()

    if (!invite) {
      return err(new Error('Failed to create invite'))
    }

    // Generate signed token using the invite ID
    const token = generateInviteToken(invite.id)

    // Update invite with the real token
    await db
      .update(invites)
      .set({ token, updatedAt: new Date() })
      .where(eq(invites.id, invite.id))

    const updatedInvite = { ...invite, token }
    const inviteUrl     = `${env.INVITE_BASE_URL}/${token}`

    await writeAuditEvent({
      eventType:  'invite_created',
      entityType: 'invite',
      entityId:   invite.id,
      userId,
      actorType:  'user',
      actorId:    userId,
      metadata:   { debtId: input.debtId, privacyLevel: input.privacyLevel },
      ipAddress,
    })

    return ok({ invite: updatedInvite, inviteUrl })
  }

  /**
   * Resolve an invite token and return the invite with context.
   * Called when a contributor opens an invite link.
   * Records the open event for audit purposes.
   */
  async resolveInviteToken(
    token:      string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<Result<InviteWithContext>> {
    const inviteId = verifyInviteToken(token)
    if (!inviteId) {
      return err(new Error('Invalid or tampered invite link'))
    }

    const invite = await db.query.invites.findFirst({
      where: and(
        eq(invites.id, inviteId),
        eq(invites.token, token),
      ),
    })

    if (!invite) {
      return err(new Error('Invite not found'))
    }

    if (invite.status !== 'active') {
      return err(new Error(`This invite is ${invite.status}`))
    }

    if (new Date() > invite.expiresAt) {
      // Mark as expired
      await db
        .update(invites)
        .set({ status: 'expired', updatedAt: new Date() })
        .where(eq(invites.id, invite.id))
      return err(new Error('This invite has expired'))
    }

    // Fetch recipient
    const user = await db.query.users.findFirst({
      where: eq(users.id, invite.userId),
    })

    if (!user) {
      return err(new Error('Invite data incomplete'))
    }

    // Fetch debt context: single debt if invite is debt-specific,
    // otherwise all active verified debts for the user
    let debt: Debt | null = null
    let eligibleDebts: Debt[] = []

    if (invite.debtId) {
      const d = await db.query.debts.findFirst({
        where: eq(debts.id, invite.debtId),
      })
      if (!d) return err(new Error('Invite data incomplete'))
      debt = d
      eligibleDebts = [d]
    } else {
      // User-level invite — fetch all active, CoP-verified debts
      const allDebts = await db.query.debts.findMany({
        where: and(
          eq(debts.userId, invite.userId),
          eq(debts.copVerified, true),
        ),
      })
      eligibleDebts = allDebts.filter(d => d.status !== 'resolved')
    }

    // Increment open count
    await db
      .update(invites)
      .set({ openCount: invite.openCount + 1, updatedAt: new Date() })
      .where(eq(invites.id, invite.id))

    await writeAuditEvent({
      eventType:  'invite_opened',
      entityType: 'invite',
      entityId:   invite.id,
      userId:     invite.userId,
      actorType:  'system',
      ipAddress,
      userAgent,
    })

    return ok({
      invite,
      debt,
      debts: eligibleDebts,
      recipient: { firstName: user.firstName, lastName: user.lastName },
    })
  }

  /** Revoke an invite — recipient can do this at any time */
  async revokeInvite(
    inviteId: string,
    userId:   string,
    reason?:  string,
  ): Promise<Result<Invite>> {
    const invite = await db.query.invites.findFirst({
      where: and(
        eq(invites.id, inviteId),
        eq(invites.userId, userId),
      ),
    })

    if (!invite) {
      return err(new Error('Invite not found or access denied'))
    }

    const [updated] = await db
      .update(invites)
      .set({
        status:        'revoked',
        revokedAt:     new Date(),
        revokedReason: reason ?? null,
        updatedAt:     new Date(),
      })
      .where(eq(invites.id, inviteId))
      .returning()

    if (!updated) {
      return err(new Error('Failed to revoke invite'))
    }

    await writeAuditEvent({
      eventType:  'invite_revoked',
      entityType: 'invite',
      entityId:   inviteId,
      userId,
      actorType:  'user',
      actorId:    userId,
      metadata:   { reason },
    })

    return ok(updated)
  }
}

export const inviteService = new InviteService()
