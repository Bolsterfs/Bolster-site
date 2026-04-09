import { env } from '../config/env.js'
import type { FeeCalculation } from '../types/index.js'

/**
 * Calculate Bolster fees on a contributor payment.
 *
 * Fee model: 1.5% of gross amount, min £1.00, max £15.00
 * Creditor receives 100% of net amount — fee is charged ON TOP to contributor.
 *
 * Example: contributor pays £150 to clear a £150 debt
 *   gross = £150 + fee
 *   fee   = max(£1.00, min(£15.00, £150 × 1.5%)) = £2.25
 *   gross = £152.25
 *   net   = £150.00 (to creditor)
 *
 * NOTE: All amounts in pence (integer). Never use floats for money.
 */
export function calculateFee(netAmountPence: number): FeeCalculation {
  if (!Number.isInteger(netAmountPence) || netAmountPence <= 0) {
    throw new Error('Amount must be a positive integer (pence)')
  }

  // Fee is a percentage of the net (creditor) amount
  const rawFeePence = Math.round(netAmountPence * (env.BOLSTER_FEE_PERCENTAGE / 100))

  // Apply min/max caps
  const feeAmountPence = Math.max(
    env.BOLSTER_FEE_MIN_PENCE,
    Math.min(env.BOLSTER_FEE_MAX_PENCE, rawFeePence),
  )

  const grossAmountPence = netAmountPence + feeAmountPence
  const feePercentage    = (feeAmountPence / netAmountPence) * 100

  return {
    grossAmountPence,
    feeAmountPence,
    netAmountPence,
    feePercentage: Math.round(feePercentage * 100) / 100,
  }
}

/** Format pence as a human-readable GBP string */
export function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`
}

/** Validate that an amount is within Bolster's allowed range */
export function validatePaymentAmount(netAmountPence: number): void {
  if (netAmountPence < env.MIN_PAYMENT_AMOUNT_PENCE) {
    throw new Error(`Minimum payment is ${formatPence(env.MIN_PAYMENT_AMOUNT_PENCE)}`)
  }
  if (netAmountPence > env.MAX_PAYMENT_AMOUNT_PENCE) {
    throw new Error(`Maximum payment is ${formatPence(env.MAX_PAYMENT_AMOUNT_PENCE)}`)
  }
}
