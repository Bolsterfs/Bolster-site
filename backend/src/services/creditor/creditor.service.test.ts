import { describe, it, expect } from 'vitest'
import { normaliseCreditorName } from './creditor.service.js'

describe('normaliseCreditorName', () => {
  it('ignores case, punctuation and company suffixes', () => {
    expect(normaliseCreditorName('British Gas Trading Ltd.')).toBe('british gas trading')
    expect(normaliseCreditorName('  THE Vodafone  UK plc ')).toBe('vodafone')
    expect(normaliseCreditorName('Zopa Bank Limited')).toBe('zopa bank')
  })

  it('treats "&" and "and" the same', () => {
    expect(normaliseCreditorName('Marks & Spencer')).toBe(normaliseCreditorName('Marks and Spencer'))
  })

  it('returns an empty string when nothing meaningful is left', () => {
    expect(normaliseCreditorName(' Ltd. ')).toBe('')
  })
})
