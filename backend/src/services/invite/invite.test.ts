import { describe, it, expect, beforeAll } from 'vitest'
import { generateInviteToken, verifyInviteToken } from './invite.service.js'

beforeAll(() => {
  process.env.INVITE_SECRET = 'test-invite-secret-must-be-at-least-32-characters-long'
})

// Token format: {base64url(payload)}-{43-char base64url HMAC}. The payload can
// itself contain '-', so split by the fixed signature length, as the service does.
const SIGNATURE_LENGTH = 43

function splitToken(token: string): { payload: string; sig: string } {
  return {
    payload: token.slice(0, token.length - SIGNATURE_LENGTH - 1),
    sig:     token.slice(-SIGNATURE_LENGTH),
  }
}

describe('invite token signing', () => {
  it('generates a token and verifies it correctly', () => {
    const inviteId = 'abc123-def456-ghi789'
    const token    = generateInviteToken(inviteId)

    expect(token).toBeTruthy()
    expect(token).toMatch(/^[A-Za-z0-9_-]+-[A-Za-z0-9_-]{43}$/)

    const extracted = verifyInviteToken(token)
    expect(extracted).toBe(inviteId)
  })

  it('returns null for a tampered token', () => {
    const inviteId = 'abc123-def456-ghi789'
    const token    = generateInviteToken(inviteId)

    // Swap in a different payload but keep the original signature
    const { sig } = splitToken(token)
    const forgedPayload = Buffer.from(`someone-elses-invite:${Date.now()}`).toString('base64url')
    const tampered = `${forgedPayload}-${sig}`

    expect(verifyInviteToken(tampered)).toBeNull()
  })

  it('returns null for a token with tampered signature', () => {
    const inviteId = 'abc123-def456-ghi789'
    const token    = generateInviteToken(inviteId)

    // Change one character of the signature, keeping its length
    const { payload, sig } = splitToken(token)
    const flipped  = (sig.startsWith('A') ? 'B' : 'A') + sig.slice(1)
    const tampered = `${payload}-${flipped}`

    expect(verifyInviteToken(tampered)).toBeNull()
  })

  it('returns null for a completely invalid token', () => {
    expect(verifyInviteToken('not-a-valid-token')).toBeNull()
    expect(verifyInviteToken('')).toBeNull()
    expect(verifyInviteToken('a.b.c')).toBeNull()
  })

  it('different invite IDs produce different tokens', () => {
    const token1 = generateInviteToken('id-one')
    const token2 = generateInviteToken('id-two')
    expect(token1).not.toBe(token2)
  })
})

describe('invite short codes', () => {
  it('generates 9-character codes from the unambiguous alphabet', async () => {
    const { generateShortCode, looksLikeShortCode, SHORT_CODE_LENGTH } = await import('./invite.service.js')
    for (let i = 0; i < 50; i++) {
      const code = generateShortCode()
      expect(code).toHaveLength(SHORT_CODE_LENGTH)
      expect(code).not.toMatch(/[0O1lI]/)
      expect(looksLikeShortCode(code)).toBe(true)
    }
  })

  it('does not mistake a signed token for a short code', async () => {
    const { generateInviteToken, looksLikeShortCode } = await import('./invite.service.js')
    expect(looksLikeShortCode(generateInviteToken('11111111-2222-3333-4444-555555555555'))).toBe(false)
    expect(looksLikeShortCode('short')).toBe(false)
    expect(looksLikeShortCode('k7mQ2xPzR0')).toBe(false) // wrong length
  })

  it('builds short links regardless of how INVITE_BASE_URL was written', async () => {
    const { buildInviteUrl } = await import('./invite.service.js')
    const { env } = await import('../../config/env.js')
    const original = env.INVITE_BASE_URL
    const invite = { token: 'tok', shortCode: 'k7mQ2xPzR' }
    try {
      for (const base of ['https://app.example', 'https://app.example/', 'https://app.example/invite', 'https://app.example/i']) {
        ;(env as { INVITE_BASE_URL: string }).INVITE_BASE_URL = base
        expect(buildInviteUrl(invite)).toBe('https://app.example/i/k7mQ2xPzR')
        expect(buildInviteUrl({ token: 'tok', shortCode: null })).toBe('https://app.example/invite/tok')
      }
    } finally {
      ;(env as { INVITE_BASE_URL: string }).INVITE_BASE_URL = original
    }
  })
})
