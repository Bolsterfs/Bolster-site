import { describe, it, expect } from 'vitest'
import { calculateFee, formatPence, validatePaymentAmount } from '../utils/fees.js'

// Mock env for tests
process.env.BOLSTER_FEE_PERCENTAGE = '1.5'
process.env.BOLSTER_FEE_MIN_PENCE  = '100'
process.env.BOLSTER_FEE_MAX_PENCE  = '1500'
process.env.MIN_PAYMENT_AMOUNT_PENCE = '100'
process.env.MAX_PAYMENT_AMOUNT_PENCE = '15000000'

describe('calculateFee', () => {
  it('applies 1.5% fee correctly', () => {
    const result = calculateFee(15000) // £150.00
    expect(result.netAmountPence).toBe(15000)
    expect(result.feeAmountPence).toBe(225)    // £2.25
    expect(result.grossAmountPence).toBe(15225) // £152.25
  })

  it('applies minimum fee of £1.00 on small amounts', () => {
    const result = calculateFee(500) // £5.00 → 1.5% = 7.5p → rounds to min £1
    expect(result.feeAmountPence).toBe(100) // £1.00 minimum
    expect(result.grossAmountPence).toBe(600)
  })

  it('caps fee at £15.00 on large amounts', () => {
    const result = calculateFee(200000) // £2,000 → 1.5% = £30 → capped at £15
    expect(result.feeAmountPence).toBe(1500) // £15.00 maximum
    expect(result.grossAmountPence).toBe(201500)
  })

  it('throws on non-integer amounts', () => {
    expect(() => calculateFee(100.5)).toThrow()
  })

  it('throws on zero amount', () => {
    expect(() => calculateFee(0)).toThrow()
  })

  it('throws on negative amount', () => {
    expect(() => calculateFee(-100)).toThrow()
  })

  it('creditor always receives net amount', () => {
    const result = calculateFee(10000) // £100
    expect(result.netAmountPence).toBe(10000)
    expect(result.grossAmountPence).toBe(result.netAmountPence + result.feeAmountPence)
  })
})

describe('formatPence', () => {
  it('formats pence as GBP string', () => {
    expect(formatPence(1000)).toBe('£10.00')
    expect(formatPence(100)).toBe('£1.00')
    expect(formatPence(99)).toBe('£0.99')
    expect(formatPence(150025)).toBe('£1,500.25')
  })
})

describe('validatePaymentAmount', () => {
  it('accepts valid amounts', () => {
    expect(() => validatePaymentAmount(1000)).not.toThrow()
    expect(() => validatePaymentAmount(100)).not.toThrow()
  })

  it('rejects amounts below minimum', () => {
    expect(() => validatePaymentAmount(99)).toThrow()
    expect(() => validatePaymentAmount(0)).toThrow()
  })
})
