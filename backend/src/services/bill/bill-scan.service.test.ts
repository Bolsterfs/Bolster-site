import { describe, it, expect } from 'vitest'
import { parseAmountToPence, cleanReference, cleanDate } from './bill-scan.service.js'

describe('parseAmountToPence', () => {
  it('reads plain and formatted amounts exactly', () => {
    expect(parseAmountToPence('184.00')).toBe(18400)
    expect(parseAmountToPence('£1,184.50')).toBe(118450)
    expect(parseAmountToPence('184')).toBe(18400)
    expect(parseAmountToPence('0.07')).toBe(7)
    expect(parseAmountToPence('19.9')).toBe(1990)
    expect(parseAmountToPence(184.5)).toBe(18450)
    expect(parseAmountToPence('2750.10')).toBe(275010)   // no float drift
  })

  it('refuses anything that is not a plain positive amount', () => {
    for (const bad of [null, undefined, '', 'about 50', '12.345', '-20.00', '0', '0.00', '1e5', '12.3.4', '£']) {
      expect(parseAmountToPence(bad)).toBeNull()
    }
  })
})

describe('cleanReference', () => {
  it('keeps references a payment can carry', () => {
    expect(cleanReference(' 850012345 ')).toBe('850012345')
    expect(cleanReference('A-1234/56')).toBe('A-1234/56')
    expect(cleanReference('AB  12')).toBe('AB 12')
  })

  it('drops references that are too long or contain other characters', () => {
    expect(cleanReference('1234567890123456789')).toBeNull()
    expect(cleanReference('REF#123')).toBeNull()
    expect(cleanReference('   ')).toBeNull()
    expect(cleanReference(null)).toBeNull()
  })
})

describe('cleanDate', () => {
  it('accepts only real YYYY-MM-DD dates', () => {
    expect(cleanDate('2026-11-05')).toBe('2026-11-05')
    expect(cleanDate('2026-02-30')).toBeNull()
    expect(cleanDate('05/11/2026')).toBeNull()
    expect(cleanDate(null)).toBeNull()
  })
})
