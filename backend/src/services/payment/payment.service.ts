import { and, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { payments, debts, invites, users } from '../../db/schema/index.js'
import { truelayerService } from './truelayer.js'
import { stripeService } from './stripe.service.js'
import type { StripeSessionState } from './stripe.service.js'
import { amlService } from '../aml/aml.service.js'
import { notificationService } from '../notification/notification.service.js'
import { calculateFee, validatePaymentAmount } from '../../utils/fees.js'
import { writeAuditEvent } from '../../utils/audit.js'
import { inviteService } from '../invite/invite.service.js'
import type { InitiatePaymentInput, Result } from '../../types/index.js'
import { ok, err, QuoteChangedError } from '../../types/index.js'
import { env } from '../../config/env.js'
import type { Payment } from '../../db/schema/index.js'

export interface PaymentInitiationResult {
  paymentId:   string
  authUri:     string       // redirect contributor here for SCA / Stripe Checkout
  feeAmountPence: number
  grossAmountPence: number
  netAmountPence: number
}

export type ReconcileOutcome =
  | 'settled'        // Stripe says paid — we settled it now
  | 'expired'        // Stripe session expired unpaid — marked as expired
  | 'still_pending'  // contributor is still on the checkout page
  | 'already_final'  // nothing to do
  | 'not_card'       // bank-rail payment, Stripe has no record
  | 'unknown'        // could not reach Stripe or no session found (yet)

export interface ReconcileSummary {
  checked:  number
  settled:  number
  expired:  number
  unknown:  number
}

/** How long a card payment may stay 'pending' before the sweep looks at it. */
const RECONCILE_MIN_AGE_MS = 2 * 60 * 1000
/** Don't re-ask Stripe about the same payment more often than this. */
const RECONCILE_COOLDOWN_MS = 20 * 1000
/** If no Checkout session can be found at all after this long, give up. */
const NO_SESSION_GIVE_UP_MS = 24 * 60 * 60 * 1000

export class PaymentService {
  /**
   * Orchestrate the full payment initiation flow:
   * 1. Validate invite and payment amount
   * 2. AML screen the contributor (FAIL-CLOSED — errors block the payment)
   * 3. Calculate fees
   * 4. Create payment record
   * 5. Initiate payment via TrueLayer PIS (or Stripe fallback)
   *
   * Money flow (TrueLayer): contributor's bank → Faster Payments → creditor
   * Money flow (Stripe):    contributor's card → Stripe → Bolster → creditor
   * TrueLayer is preferred because Bolster never holds funds in that path.
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

    const { invite, debts: eligibleDebts } = inviteResult.value

    // Resolve the debt the contributor selected
    const debt = eligibleDebts.find(d => d.id === input.debtId)
    if (!debt) {
      return err(new Error('Selected debt is not available for this invite'))
    }

    // Validate payment amount against debt balance
    const remainingPence = debt.totalAmountPence - debt.paidAmountPence
    if (remainingPence <= 0) {
      return err(new Error('This debt has been fully paid'))
    }

    if (input.amountPence > remainingPence) {
      return err(new Error(
        `Payment amount exceeds the outstanding balance on this debt (£${(remainingPence / 100).toFixed(2)} remaining)`,
      ))
    }

    // Validate payment amount against system constraints
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

    // ── Step 2: AML screen the contributor (FAIL-CLOSED) ──────────────────
    // If screening cannot be completed, amlService returns err() and we STOP.
    // No payment record is created, no money is taken.
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

    // Fee transparency: the contributor must never be charged a total they
    // were not shown. If the checkout sent the total it displayed and ours
    // differs (e.g. fee settings changed mid-session), stop before any
    // payment record is created and no money is taken.
    if (
      input.expectedGrossAmountPence !== undefined &&
      input.expectedGrossAmountPence !== fees.grossAmountPence
    ) {
      return err(new QuoteChangedError(fees.grossAmountPence))
    }

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

    // ── Step 5: Initiate payment ──────────────────────────────────────────
    //
    // When TrueLayer PIS is disabled → go straight to Stripe.
    // When TrueLayer PIS is enabled  → try TrueLayer first, fall back to
    //                                   Stripe if it fails.
    if (!env.ENABLE_PAYMENT_INITIATION) {
      return this.initiateViaStripe(payment, debt.creditorName, input.inviteToken, fees)
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
      // TrueLayer failed — try Stripe as fallback before giving up
      if (env.STRIPE_SECRET_KEY) {
        const stripeResult = await this.initiateViaStripe(
          payment, debt.creditorName, input.inviteToken, fees,
        )
        if (stripeResult.ok) return stripeResult
      }

      // Both providers failed — mark payment as failed + notify contributor
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

      // Reassure the contributor no money left their account
      await notificationService.sendContributorFailureNotice({
        contributorEmail: payment.contributorEmail,
        contributorName:  payment.contributorName,
        creditorName:     debt.creditorName,
        paymentRef:       payment.id.slice(0, 8).toUpperCase(),
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

  // ── Stripe fallback ───────────────────────────────────────────────────────

  private async initiateViaStripe(
    payment:       Payment,
    creditorName:  string,
    inviteToken:   string,
    fees:          { feeAmountPence: number; grossAmountPence: number; netAmountPence: number },
  ): Promise<Result<PaymentInitiationResult>> {
    const stripeResult = await stripeService.createCheckoutSession({
      grossAmountPence: fees.grossAmountPence,
      feeAmountPence:   fees.feeAmountPence,
      creditorName,
      bolsterPaymentId: payment.id,
      inviteToken,
      successUrl: `${env.APP_URL}/payment/complete?payment_id=${payment.id}`,
      cancelUrl:  `${env.APP_URL}/invite/${inviteToken}`,
    })

    if (!stripeResult.ok) {
      // Stripe checkout could not be created — mark failed + notify contributor
      await db
        .update(payments)
        .set({ status: 'failed', updatedAt: new Date() })
        .where(eq(payments.id, payment.id))

      await writeAuditEvent({
        eventType:  'payment_failed',
        entityType: 'payment',
        entityId:   payment.id,
        userId:     payment.recipientUserId,
        actorType:  'system',
        metadata:   { reason: stripeResult.error.message, provider: 'stripe' },
      })

      await notificationService.sendContributorFailureNotice({
        contributorEmail: payment.contributorEmail,
        contributorName:  payment.contributorName,
        creditorName,
        paymentRef:       payment.id.slice(0, 8).toUpperCase(),
      })

      return err(stripeResult.error)
    }

    await db
      .update(payments)
      .set({
        truelayerAuthUri: stripeResult.value.sessionUrl,  // reuse column to store redirect URL
        stripeSessionId:  stripeResult.value.sessionId,   // lets us reconcile if the webhook is missed
        status:           'pending',
        updatedAt:        new Date(),
      })
      .where(eq(payments.id, payment.id))

    return ok({
      paymentId:        payment.id,
      authUri:          stripeResult.value.sessionUrl,
      feeAmountPence:   fees.feeAmountPence,
      grossAmountPence: fees.grossAmountPence,
      netAmountPence:   fees.netAmountPence,
    })
  }

  // ── Settlement (shared by both TrueLayer and Stripe webhooks) ─────────────

  /**
   * Core settlement logic — updates payment, debt balance, and audit log,
   * then sends notifications to both the contributor and the recipient.
   * Called by both handlePaymentSettled and handleStripeSettled.
   */
  private async settlePayment(
    payment:  Payment,
    provider: string,
    source:   'webhook' | 'reconciliation' = 'webhook',
  ): Promise<void> {
    const now = new Date()

    // Atomic claim: only the first caller to flip the row to 'settled' carries
    // on. A webhook and a reconciliation sweep can race for the same payment;
    // without this the creditor balance would be credited twice.
    const claimed = await db
      .update(payments)
      .set({
        status:                 'settled',
        settledAt:              now,
        consumerDutyRecordedAt: now,
        updatedAt:              now,
      })
      .where(and(eq(payments.id, payment.id), sql`${payments.status} <> 'settled'`))
      .returning({ id: payments.id })

    if (claimed.length === 0) {
      console.log(`[Settle] Payment ${payment.id} already settled by another path — skipping`)
      return
    }

    // Atomic increment so concurrent payments are safe
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

    let fullyResolved = false

    if (debt && debt.paidAmountPence >= debt.totalAmountPence) {
      fullyResolved = true
      await db
        .update(debts)
        .set({ status: 'resolved', updatedAt: now })
        .where(eq(debts.id, debt.id))

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
      actorType:  source === 'webhook' ? 'webhook' : 'system',
      actorId:    source === 'webhook' ? provider : `${provider}_reconciliation`,
      metadata:   {
        provider,
        source,
        netAmountPence: payment.netAmountPence,
        settledAt:      now.toISOString(),
        ...(source === 'reconciliation' ? { stripeSessionId: payment.stripeSessionId } : {}),
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

    // ── Notifications (best-effort — never throw into settlement) ──────────
    try {
      // 1. Contributor receipt
      await notificationService.sendContributorReceipt({
        contributorEmail: payment.contributorEmail,
        contributorName:  payment.contributorName,
        creditorName:     debt?.creditorName ?? 'your creditor',
        netAmountPence:   payment.netAmountPence,
        feeAmountPence:   payment.feeAmountPence,
        grossAmountPence: payment.grossAmountPence,
        paymentRef:       payment.id.slice(0, 8).toUpperCase(),
      })

      // 2. Recipient "you received help" notification
      const recipient = await db.query.users.findFirst({
        where: eq(users.id, payment.recipientUserId),
      })

      if (recipient && debt) {
        const remainingPence = Math.max(
          debt.totalAmountPence - debt.paidAmountPence,
          0,
        )
        await notificationService.sendRecipientHelpReceived({
          recipientEmail:     recipient.email,
          recipientFirstName: recipient.firstName,
          recipientPhone:     recipient.phone,
          contributorName:    payment.contributorName,
          creditorName:       debt.creditorName,
          netAmountPence:     payment.netAmountPence,
          remainingPence,
          fullyResolved,
        })
      }
    } catch (e) {
      console.error(
        'Settlement notifications failed (payment still settled):',
        e instanceof Error ? e.message : e,
      )
    }
  }

  /**
   * Handle a TrueLayer webhook for payment settlement.
   */
  async handlePaymentSettled(truelayerPaymentId: string): Promise<void> {
    const payment = await db.query.payments.findFirst({
      where: eq(payments.truelayerPaymentId, truelayerPaymentId),
    })

    if (!payment) {
      console.error(`Payment not found for TrueLayer ID: ${truelayerPaymentId}`)
      return
    }

    await this.settlePayment(payment, 'truelayer')
  }

  /**
   * Handle a TrueLayer webhook for a failed payment — notify the contributor.
   */
  async handlePaymentFailed(truelayerPaymentId: string): Promise<void> {
    const payment = await db.query.payments.findFirst({
      where: eq(payments.truelayerPaymentId, truelayerPaymentId),
    })

    if (!payment) {
      console.error(`Payment not found for TrueLayer ID: ${truelayerPaymentId}`)
      return
    }

    if (payment.status === 'failed') return // idempotent

    await db
      .update(payments)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(eq(payments.id, payment.id))

    await writeAuditEvent({
      eventType:  'payment_failed',
      entityType: 'payment',
      entityId:   payment.id,
      userId:     payment.recipientUserId,
      actorType:  'webhook',
      actorId:    'truelayer',
      metadata:   { reason: 'truelayer_payment_failed_webhook' },
    })

    const debt = await db.query.debts.findFirst({
      where: eq(debts.id, payment.debtId),
    })

    await notificationService.sendContributorFailureNotice({
      contributorEmail: payment.contributorEmail,
      contributorName:  payment.contributorName,
      creditorName:     debt?.creditorName ?? 'your creditor',
      paymentRef:       payment.id.slice(0, 8).toUpperCase(),
    })
  }

  // ── Stripe reconciliation ─────────────────────────────────────────────────
  //
  // Webhooks are the normal way we learn a card payment succeeded, but they
  // can be missed (local listener not running, endpoint not registered,
  // network blip). Without this a paid payment would sit as "pending" forever
  // and the creditor's balance would never update. Reconciliation asks Stripe
  // directly and applies the same settlement path the webhook would have.

  /**
   * Reconcile ONE card payment against Stripe. Safe to call repeatedly —
   * settlement is idempotent and a cooldown stops us hammering Stripe.
   */
  async reconcileStripePayment(
    payment: Payment,
    opts: { force?: boolean } = {},
  ): Promise<ReconcileOutcome> {
    if (payment.status === 'settled' || payment.status === 'failed' ||
        payment.status === 'refunded' || payment.status === 'expired') {
      return 'already_final'
    }
    if (payment.truelayerPaymentId) return 'not_card'
    if (!env.STRIPE_SECRET_KEY) return 'unknown'

    if (!opts.force && payment.lastReconciledAt &&
        Date.now() - payment.lastReconciledAt.getTime() < RECONCILE_COOLDOWN_MS) {
      return 'still_pending'
    }

    const now = new Date()
    await db.update(payments)
      .set({ lastReconciledAt: now })
      .where(eq(payments.id, payment.id))

    // Look the session up — by stored ID, or by metadata for older rows.
    let sessionId: string | null = payment.stripeSessionId
    let state: StripeSessionState

    if (sessionId) {
      const r = await stripeService.getCheckoutSession(sessionId)
      if (!r.ok) {
        console.warn(`[Reconcile] Could not fetch Stripe session for ${payment.id}: ${r.error.message}`)
        return 'unknown'
      }
      state = r.value
    } else {
      const r = await stripeService.findCheckoutSessionForPayment(payment.id, payment.createdAt)
      if (!r.ok) {
        console.warn(`[Reconcile] Could not search Stripe sessions for ${payment.id}: ${r.error.message}`)
        return 'unknown'
      }
      if (!r.value) {
        // Nothing on Stripe's side. Either checkout creation never completed,
        // or it's too old to have been created with our metadata. Give up
        // after a day so these don't stay pending forever either.
        if (now.getTime() - payment.createdAt.getTime() > NO_SESSION_GIVE_UP_MS) {
          await this.expireStripePayment(payment, 'no_checkout_session_found')
          return 'expired'
        }
        return 'unknown'
      }
      state = r.value
      sessionId = state.sessionId
      await db.update(payments)
        .set({ stripeSessionId: sessionId })
        .where(eq(payments.id, payment.id))
    }

    if (state.paymentStatus === 'paid') {
      // Guard against a tampered or mismatched session: amounts must agree.
      if (state.amountTotal !== null && state.amountTotal !== payment.grossAmountPence) {
        console.error(
          `[Reconcile] Amount mismatch on ${payment.id}: Stripe ${state.amountTotal}p vs ours ${payment.grossAmountPence}p — NOT settling`,
        )
        return 'unknown'
      }
      console.log(`[Reconcile] Stripe reports ${payment.id} paid — settling (missed webhook)`)
      await this.settlePayment({ ...payment, stripeSessionId: sessionId }, 'stripe', 'reconciliation')
      return 'settled'
    }

    if (state.status === 'expired') {
      await this.expireStripePayment(payment, 'stripe_checkout_expired')
      return 'expired'
    }

    return 'still_pending'
  }

  /**
   * Sweep every card payment that has been pending for a while and reconcile
   * each one. Returns counts for logging. Called on an interval by the server.
   */
  async reconcilePendingStripePayments(limit = 50): Promise<ReconcileSummary> {
    const summary: ReconcileSummary = { checked: 0, settled: 0, expired: 0, unknown: 0 }
    if (!env.STRIPE_SECRET_KEY) return summary

    const cutoff = new Date(Date.now() - RECONCILE_MIN_AGE_MS)
    const stuck = await db.query.payments.findMany({
      where: and(
        inArray(payments.status, ['initiated', 'pending']),
        isNull(payments.truelayerPaymentId),
        lt(payments.createdAt, cutoff),
        or(
          isNull(payments.lastReconciledAt),
          lt(payments.lastReconciledAt, new Date(Date.now() - RECONCILE_COOLDOWN_MS)),
        ),
      ),
      orderBy: (p, { asc }) => [asc(p.createdAt)],
      limit,
    })

    for (const payment of stuck) {
      summary.checked++
      try {
        const outcome = await this.reconcileStripePayment(payment)
        if (outcome === 'settled') summary.settled++
        else if (outcome === 'expired') summary.expired++
        else if (outcome === 'unknown') summary.unknown++
      } catch (e) {
        summary.unknown++
        console.error(`[Reconcile] Error on ${payment.id}:`, e instanceof Error ? e.message : e)
      }
    }
    return summary
  }

  private async expireStripePayment(payment: Payment, reason: string): Promise<void> {
    await db.update(payments)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(eq(payments.id, payment.id))

    await writeAuditEvent({
      eventType:  'payment_failed',
      entityType: 'payment',
      entityId:   payment.id,
      userId:     payment.recipientUserId,
      actorType:  'system',
      actorId:    'stripe_reconciliation',
      metadata:   { reason, stripeSessionId: payment.stripeSessionId },
    })
    // No contributor email: an expired checkout means they never completed
    // it, so a "your payment failed" notice would only confuse them.
  }

  /**
   * Handle a Stripe checkout.session.completed webhook.
   * Looks up payment by our own ID (stored in Stripe session metadata).
   */
  async handleStripeSettled(bolsterPaymentId: string): Promise<void> {
    console.log(`[Stripe] checkout.session.completed received for payment ${bolsterPaymentId}`)

    const payment = await db.query.payments.findFirst({
      where: eq(payments.id, bolsterPaymentId),
    })

    if (!payment) {
      console.error(`[Stripe] Payment not found for Bolster ID: ${bolsterPaymentId}`)
      return
    }

    if (payment.status === 'settled') {
      console.log(`[Stripe] Payment ${bolsterPaymentId} already settled — skipping`)
      return // idempotent — already settled
    }

    console.log(`[Stripe] Settling payment ${bolsterPaymentId} (${payment.netAmountPence}p net)`)
    await this.settlePayment(payment, 'stripe')
    console.log(`[Stripe] Payment ${bolsterPaymentId} settled successfully`)
  }
}

export const paymentService = new PaymentService()
