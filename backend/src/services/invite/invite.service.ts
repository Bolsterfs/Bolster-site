import crypto from 'crypto'
import { eq, and } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { invites, debts, users } from '../../db/schema/index.js'
import type { Invite, Debt, User } from '../../db/schema/index.js'
import type { CreateInviteInput, Result } from '../../types/index.js'
import { ok, err, InviteUnavailableError } from '../../types/index.js'
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

// ─── Short share codes ────────────────────────────────────────────────────────
//
// The signed token above is ~100 characters: fine for the machine, awkward in a
// WhatsApp message. A short code is a random 9-character string from an
// alphabet with no look-alikes (no 0/O, 1/l/I), looked up in the invites table.
// 57^9 ≈ 6×10^15 combinations, so guessing one is not practical, and the
// resolve endpoint is rate-limited besides. The long token keeps working.

const SHORT_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
export const SHORT_CODE_LENGTH = 9
const SHORT_CODE_PATTERN = new RegExp(`^[${SHORT_CODE_ALPHABET}]{${SHORT_CODE_LENGTH}}$`)

export function generateShortCode(): string {
  const bytes = crypto.randomBytes(SHORT_CODE_LENGTH)
  let out = ''
  for (let i = 0; i < SHORT_CODE_LENGTH; i++) {
    out += SHORT_CODE_ALPHABET[bytes[i]! % SHORT_CODE_ALPHABET.length]
  }
  return out
}

/** True when a path segment looks like a short code rather than a signed token. */
export function looksLikeShortCode(value: string): boolean {
  return SHORT_CODE_PATTERN.test(value)
}

/**
 * The public URL for an invite. Uses the short code when the invite has one.
 *
 * INVITE_BASE_URL historically had to end in "/invite"; people kept setting it
 * to the bare site root, which produced links with no "/invite/" and a 404.
 * Now any of these work: "https://app.example", "https://app.example/invite",
 * "https://app.example/i" — the path is normalised to the site root here.
 */
export function buildInviteUrl(invite: { token: string; shortCode?: string | null }): string {
  const root = env.INVITE_BASE_URL.replace(/\/+$/, '').replace(/\/(invite|i)$/, '')
  return invite.shortCode
    ? `${root}/i/${invite.shortCode}`
    : `${root}/invite/${invite.token}`
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

    // Generate signed token using the invite ID, plus a short share code
    const token = generateInviteToken(invite.id)
    const shortCode = await this.uniqueShortCode()

    // Update invite with the real token and code
    await db
      .update(invites)
      .set({ token, shortCode, updatedAt: new Date() })
      .where(eq(invites.id, invite.id))

    const updatedInvite = { ...invite, token, shortCode }
    const inviteUrl     = buildInviteUrl(updatedInvite)

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
  /** A short code no other invite has (collisions are astronomically unlikely, but cheap to check). */
  private async uniqueShortCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateShortCode()
      const clash = await db.query.invites.findFirst({
        where:   eq(invites.shortCode, code),
        columns: { id: true },
      })
      if (!clash) return code
    }
    throw new Error('Could not allocate a unique invite code')
  }

  /**
   * Accepts EITHER the long signed token OR the short share code — whatever was
   * in the link the contributor opened — and returns the invite with context.
   */
  async resolveInviteToken(
    tokenOrCode: string,
    ipAddress?:  string,
    userAgent?:  string,
  ): Promise<Result<InviteWithContext>> {
    let invite: Invite | undefined

    if (looksLikeShortCode(tokenOrCode)) {
      invite = await db.query.invites.findFirst({
        where: eq(invites.shortCode, tokenOrCode),
      })
    } else {
      const inviteId = verifyInviteToken(tokenOrCode)
      if (!inviteId) {
        return err(new InviteUnavailableError('INVITE_INVALID', 'Invalid or tampered invite link'))
      }
      invite = await db.query.invites.findFirst({
        where: and(
          eq(invites.id, inviteId),
          eq(invites.token, tokenOrCode),
        ),
      })
    }

    if (!invite) {
      return err(new InviteUnavailableError('INVITE_INVALID', 'Invite not found'))
    }

    // Fetch recipient first so unavailable-states can name them ("ask Leon for a new link")
    const user = await db.query.users.findFirst({
      where: eq(users.id, invite.userId),
    })

    if (!user) {
      return err(new InviteUnavailableError('INVITE_INVALID', 'Invite data incomplete'))
    }

    if (invite.status === 'revoked') {
      return err(new InviteUnavailableError('INVITE_REVOKED', 'This invite has been withdrawn', user.firstName))
    }
    if (invite.status === 'fully_paid') {
      return err(new InviteUnavailableError('INVITE_FULLY_PAID', 'This bill has already been paid in full', user.firstName))
    }
    if (invite.status === 'expired' || new Date() > invite.expiresAt) {
      if (invite.status !== 'expired') {
        await db
          .update(invites)
          .set({ status: 'expired', updatedAt: new Date() })
          .where(eq(invites.id, invite.id))
      }
      return err(new InviteUnavailableError('INVITE_EXPIRED', 'This invite has expired', user.firstName))
    }
    if (invite.status !== 'active') {
      return err(new InviteUnavailableError('INVITE_INVALID', `This invite is ${invite.status}`))
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
