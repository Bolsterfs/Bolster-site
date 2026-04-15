import Stripe from 'stripe'
import { env } from '../../config/env.js'
import type { Result } from '../../types/index.js'
import { ok, err } from '../../types/index.js'

export interface StripeCheckoutResult {
  sessionId:  string
  sessionUrl: string   // redirect contributor here
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
