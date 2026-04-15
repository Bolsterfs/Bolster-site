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
   */
  async createCheckoutSession(params: {
    grossAmountPence: number
    creditorName:     string
    bolsterPaymentId: string
    inviteToken:      string
    successUrl:       string
    cancelUrl:        string
  }): Promise<Result<StripeCheckoutResult>> {
    try {
      const stripe = this.getClient()

      const session = await stripe.checkout.sessions.create({
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
      })

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
