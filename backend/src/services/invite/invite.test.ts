import { describe, it, expect, beforeAll } from 'vitest'
import { generateInviteToken, verifyInviteToken } from '../services/invite/invite.service.js'

beforeAll(() => {
  process.env.INVITE_SECRET = 'test-invite-secret-must-be-at-least-32-characters-long'
})

describe('invite token signing', () => {
  it('generates a token and verifies it correctly', () => {
    const inviteId = 'abc123-def456-ghi789'
    const token    = generateInviteToken(inviteId)

    expect(token).toBeTruthy()
    expect(token).toContain('.')

    const extracted = verifyInviteToken(token)
    expect(extracted).toBe(inviteId)
  })

  it('returns null for a tampered token', () => {
    const inviteId = 'abc123-def456-ghi789'
    const token    = generateInviteToken(inviteId)

    // Tamper with the payload
    const [payload, sig] = token.split('.')
    const tampered = `${payload}X.${sig}`

    expect(verifyInviteToken(tampered)).toBeNull()
  })

  it('returns null for a token with tampered signature', () => {
    const inviteId = 'abc123-def456-ghi789'
    const token    = generateInviteToken(inviteId)

    const [payload, sig] = token.split('.')
    const tampered = `${payload}.${sig}X`

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
