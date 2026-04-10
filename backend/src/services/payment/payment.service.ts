import { eq, sql } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { payments, debts, invites } from '../../db/schema/index.js'
import { truelayerService } from './truelayer.js'
import { amlService } from '../aml/aml.service.js'
import { calculateFee, validatePaymentAmount } from '../../utils/fees.js'
import { writeAuditEvent } from '../../utils/audit.js'
import { inviteService } from '../invite/invite.service.js'
import type { InitiatePaymentInput, Result } from '../../types/index.js'
import { ok, err } from '../../types/index.js'
import { env } from '../../config/env.js'

export interface PaymentInitiationResult {
  paymentId:   string
  authUri:     string       // redirect contributor here for SCA
  feeAmountPence: number
  grossAmountPence: number
  netAmountPence: number
}

export class PaymentService {
  /**
   * Orchestrate the full payment initiation flow:
   * 1. Validate invite and payment amount
   * 2. AML screen the contributor
   * 3. Calculate fees
   * 4. Initiate payment via TrueLayer PIS
   * 5. Write payment record + audit log
   *
   * Money flow: contributor's bank → TrueLayer → Faster Payments → creditor
   * Bolster NEVER holds funds in this flow.
   */
  async initiatePayment(
    input:      InitiatePaymentInput,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<Result<PaymentInitiationResult>> {
    // ── Step 1: Resolve and validate invite ───────────────────────────────
    const inviteResult = await inviteService.resolveInviteToken(
      input.inviteToken,
      ipAddress,
      userAgent,
    )
    if (!inviteResult.ok) return err(inviteResult.error)

    const { invite, debt } = inviteResult.value

    // Validate payment amount against invite constraints
    try {
      validatePaymentAmount(input.amountPence)
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)))
    }

    if (invite.maxAmountPence && input.amountPence > invite.maxAmountPence) {
      return err(new Error(
        `This invite has a maximum contribution of £${(invite.maxAmountPence / 100).toFixed(2)}`,
      ))
    }

    // Check creditor account has been CoP verified
    if (!debt.copVerified) {
      return err(new Error(
        'Creditor account verification is pending. Please try again shortly.',
      ))
    }

    // ── Step 2: AML screen the contributor ────────────────────────────────
    if (env.ENABLE_AML_SCREENING) {
      const amlResult = await amlService.screenContributor({
        name:  input.contributorName,
        email: input.contributorEmail,
      })
      if (!amlResult.ok) return err(amlResult.error)

      if (amlResult.value.result === 'confirmed_match') {
        return err(new Error(
          'We are unable to process this payment. Please contact support.',
        ))
      }
    }

    // ── Step 3: Calculate fees ────────────────────────────────────────────
    const fees = calculateFee(input.amountPence)

    // ── Step 4: Create pending payment record ─────────────────────────────
    const [payment] = await db
      .insert(payments)
      .values({
        inviteId:          invite.id,
        debtId:            debt.id,
        recipientUserId:   invite.userId,
        contributorEmail:  input.contributorEmail,
        contributorName:   input.contributorName,
        contributorIp:     ipAddress ?? null,
        grossAmountPence:  fees.grossAmountPence,
        feeAmountPence:    fees.feeAmountPence,
        netAmountPence:    fees.netAmountPence,
        status:            'initiated',
      })
      .returning()

    if (!payment) {
      return err(new Error('Failed to create payment record'))
    }

    await writeAuditEvent({
      eventType:  'payment_initiated',
      entityType: 'payment',
      entityId:   payment.id,
      userId:     invite.userId,
      actorType:  'system',
      metadata:   {
        inviteId:         invite.id,
        debtId:           debt.id,
        grossAmountPence: fees.grossAmountPence,
        feeAmountPence:   fees.feeAmountPence,
        netAmountPence:   fees.netAmountPence,
        contributorEmail: input.contributorEmail,
      },
      ipAddress,
    })

    // ── Step 5: Initiate via TrueLayer PIS ────────────────────────────────
    if (!env.ENABLE_PAYMENT_INITIATION) {
      // Sandbox mode — return a mock auth URI
      return ok({
        paymentId:        payment.id,
        authUri:          `${env.APP_URL}/payment/sandbox-complete?payment_id=${payment.id}`,
        feeAmountPence:   fees.feeAmountPence,
        grossAmountPence: fees.grossAmountPence,
        netAmountPence:   fees.netAmountPence,
      })
    }

    const tlResult = await truelayerService.initiatePayment({
      amountInMinor:       fees.netAmountPence,  // creditor receives net amount
      currency:            'GBP',
      beneficiaryName:     debt.creditorName,
      beneficiarySortCode: debt.creditorSortCode,
      beneficiaryAccount:  debt.creditorAccount,
      paymentReference:    debt.creditorRef ?? `BOLSTER-${payment.id.slice(0, 8).toUpperCase()}`,
      returnUri:           `${env.APP_URL}/payment/complete?payment_id=${payment.id}`,
      metadata: {
        bolsterPaymentId: payment.id,
        inviteToken:      input.inviteToken,
      },
    })

    if (!tlResult.ok) {
      // Mark payment as failed
      await db
        .update(payments)
        .set({ status: 'failed', updatedAt: new Date() })
        .where(eq(payments.id, payment.id))

      await writeAuditEvent({
        eventType:  'payment_failed',
        entityType: 'payment',
        entityId:   payment.id,
        userId:     invite.userId,
        actorType:  'system',
        metadata:   { reason: tlResult.error.message },
        ipAddress,
      })

      return err(tlResult.error)
    }

    const tlPayment = tlResult.value

    // Extract auth URI from TrueLayer response
    const authAction = tlPayment.authorizationFlow?.actions.find(
      (a) => a.type === 'redirect' && a.uri,
    )

    if (!authAction?.uri) {
      return err(new Error('TrueLayer did not return an authorization URI'))
    }

    // Update payment with TrueLayer payment ID
    await db
      .update(payments)
      .set({
        truelayerPaymentId: tlPayment.id,
        truelayerAuthUri:   authAction.uri,
        status:             'pending',
        updatedAt:          new Date(),
      })
      .where(eq(payments.id, payment.id))

    return ok({
      paymentId:        payment.id,
      authUri:          authAction.uri,
      feeAmountPence:   fees.feeAmountPence,
      grossAmountPence: fees.grossAmountPence,
      netAmountPence:   fees.netAmountPence,
    })
  }

  /**
   * Handle a TrueLayer webhook for payment settlement.
   * Called by the webhook route after signature verification.
   */
  async handlePaymentSettled(truelayerPaymentId: string): Promise<void> {
    const payment = await db.query.payments.findFirst({
      where: eq(payments.truelayerPaymentId, truelayerPaymentId),
    })

    if (!payment) {
      console.error(`Payment not found for TrueLayer ID: ${truelayerPaymentId}`)
      return
    }

    const now = new Date()

    // Mark payment as settled
    await db
      .update(payments)
      .set({
        status:                    'settled',
        settledAt:                 now,
        consumerDutyRecordedAt:    now,   // consumer duty outcome recorded at settlement
        updatedAt:                 now,
      })
      .where(eq(payments.id, payment.id))

    // Update debt balance — atomic increment so concurrent payments are safe
    await db
      .update(debts)
      .set({
        paidAmountPence: sql`${debts.paidAmountPence} + ${payment.netAmountPence}`,
        updatedAt:       now,
      })
      .where(eq(debts.id, payment.debtId))

    // Check if debt is fully resolved
    const debt = await db.query.debts.findFirst({
      where: eq(debts.id, payment.debtId),
    })

    if (debt && debt.paidAmountPence >= debt.totalAmountPence) {
      await db
        .update(debts)
        .set({ status: 'resolved', updatedAt: now })
        .where(eq(debts.id, debt.id))

      // Mark invite as fully paid
      await db
        .update(invites)
        .set({ status: 'fully_paid', updatedAt: now })
        .where(eq(invites.id, payment.inviteId))
    }

    await writeAuditEvent({
      eventType:  'payment_settled',
      entityType: 'payment',
      entityId:   payment.id,
      userId:     payment.recipientUserId,
      actorType:  'webhook',
      actorId:    'truelayer',
      metadata:   {
        truelayerPaymentId,
        netAmountPence: payment.netAmountPence,
        settledAt:      now.toISOString(),
      },
    })

    await writeAuditEvent({
      eventType:  'consumer_duty_outcome_recorded',
      entityType: 'payment',
      entityId:   payment.id,
      userId:     payment.recipientUserId,
      actorType:  'system',
      metadata:   {
        outcomeType:    'arrears_resolved_via_community_support',
        netAmountPence: payment.netAmountPence,
        creditorName:   debt?.creditorName,
        recordedAt:     now.toISOString(),
      },
    })
  }
}

export const paymentService = new PaymentService()
