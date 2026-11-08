import Stripe from 'stripe'
import { env } from '../../config/env.js'
import type { Result } from '../../types/index.js'
import { ok, err } from '../../types/index.js'

export interface StripeCheckoutResult {
  sessionId:  string
  sessionUrl: string   // redirect contributor here
}

/** The parts of a Checkout session we need to decide a payment's fate. */
export interface StripeSessionState {
  sessionId:     string
  /** 'open' (contributor still on checkout), 'complete' (finished) or 'expired' */
  status:        'open' | 'complete' | 'expired'
  /** 'paid' means the card was charged successfully */
  paymentStatus: 'paid' | 'unpaid' | 'no_payment_required'
  amountTotal:   number | null
  expiresAt:     Date | null
}

function toSessionState(session: Stripe.Checkout.Session): StripeSessionState {
  return {
    sessionId:     session.id,
    status:        (session.status ?? 'open') as StripeSessionState['status'],
    paymentStatus: session.payment_status as StripeSessionState['paymentStatus'],
    amountTotal:   session.amount_total,
    expiresAt:     session.expires_at ? new Date(session.expires_at * 1000) : null,
  }
}

/**
 * Stripe Checkout Service — fallback payment method
 *
 * Used when TrueLayer PIS is disabled (ENABLE_PAYMENT_INITIATION=false) or
 * when a TrueLayer payment initiation fails. Creates a Stripe Checkout
 * session that the contributor is redirected to.
 *
 * Important: unlike TrueLayer PIS, Stripe holds the funds temporarily before
 * settlement. This is acceptable as a fallback but TrueLayer remains the
 * primary path because it routes funds directly via Faster Payments.
 */
export class StripePaymentService {
  private stripe: Stripe | null = null

  private getClient(): Stripe {
    if (!this.stripe) {
      if (!env.STRIPE_SECRET_KEY) {
        throw new Error('STRIPE_SECRET_KEY is not configured')
      }
      this.stripe = new Stripe(env.STRIPE_SECRET_KEY, {
        apiVersion: '2026-03-25.dahlia',
      })
    }
    return this.stripe
  }

  /**
   * Create a Stripe Checkout session for contributor payment.
   * The gross amount (net to creditor + Bolster fee) is charged.
   *
   * When STRIPE_CONNECT_ACCOUNT_ID is set, Stripe Connect direct charges are
   * used: the payment is created on the connected account and
   * application_fee_amount automatically splits the Bolster platform fee.
   */
  async createCheckoutSession(params: {
    grossAmountPence: number
    feeAmountPence:   number
    creditorName:     string
    bolsterPaymentId: string
    inviteToken:      string
    successUrl:       string
    cancelUrl:        string
  }): Promise<Result<StripeCheckoutResult>> {
    try {
      const stripe = this.getClient()
      const connectedAccount = env.STRIPE_CONNECT_ACCOUNT_ID

      const sessionParams: Stripe.Checkout.SessionCreateParams = {
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency:     'gbp',
              unit_amount:  params.grossAmountPence,
              product_data: {
                name:        `Payment to ${params.creditorName}`,
                description: 'Community support payment via Bolster',
              },
            },
            quantity: 1,
          },
        ],
        success_url: params.successUrl,
        cancel_url:  params.cancelUrl,
        metadata: {
          bolsterPaymentId: params.bolsterPaymentId,
          inviteToken:      params.inviteToken,
        },
      }

      // When a connected account is configured, use Stripe Connect direct
      // charges so the net amount lands in the creditor's connected account
      // and the platform fee is automatically retained by Bolster.
      if (connectedAccount) {
        sessionParams.payment_intent_data = {
          application_fee_amount: params.feeAmountPence,
        }
      }

      const session = await stripe.checkout.sessions.create(
        sessionParams,
        connectedAccount ? { stripeAccount: connectedAccount } : undefined,
      )

      if (!session.url) {
        return err(new Error('Stripe did not return a checkout URL'))
      }

      return ok({
        sessionId:  session.id,
        sessionUrl: session.url,
      })
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)))
    }
  }

  /**
   * Ask Stripe for the current state of a Checkout session.
   * Used to reconcile payments when a webhook was missed.
   */
  async getCheckoutSession(sessionId: string): Promise<Result<StripeSessionState>> {
    try {
      const stripe = this.getClient()
      const session = await stripe.checkout.sessions.retrieve(
        sessionId,
        undefined,
        env.STRIPE_CONNECT_ACCOUNT_ID ? { stripeAccount: env.STRIPE_CONNECT_ACCOUNT_ID } : undefined,
      )
      return ok(toSessionState(session))
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)))
    }
  }

  /**
   * Find the Checkout session for a Bolster payment created before we started
   * storing session IDs, by matching the metadata we put on every session.
   * Searches sessions created within a window around the payment's creation.
   * Returns ok(null) when nothing matches.
   */
  async findCheckoutSessionForPayment(
    bolsterPaymentId: string,
    createdAt:        Date,
  ): Promise<Result<StripeSessionState | null>> {
    try {
      const stripe = this.getClient()
      const created = Math.floor(createdAt.getTime() / 1000)
      const opts = env.STRIPE_CONNECT_ACCOUNT_ID ? { stripeAccount: env.STRIPE_CONNECT_ACCOUNT_ID } : undefined

      // Sessions are created within seconds of the payment row; a 1-hour window
      // either side is generous and keeps the listing small.
      const sessions = stripe.checkout.sessions.list(
        { created: { gte: created - 3600, lte: created + 3600 }, limit: 100 },
        opts,
      )

      for await (const session of sessions) {
        if (session.metadata?.bolsterPaymentId === bolsterPaymentId) {
          return ok(toSessionState(session))
        }
      }
      return ok(null)
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)))
    }
  }

  /**
   * Verify a Stripe webhook signature and parse the event.
   * Throws if signature is invalid.
   */
  constructWebhookEvent(
    rawBody:   string | Buffer,
    signature: string,
  ): Stripe.Event {
    const stripe = this.getClient()
    if (!env.STRIPE_WEBHOOK_SECRET) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not configured')
    }
    return stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET)
  }
}

export const stripeService = new StripePaymentService()
