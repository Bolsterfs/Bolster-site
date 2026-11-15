/**
 * Which kind of deployment this is. Mirrors APP_STAGE on the backend.
 *
 *   test — Stripe test mode, made-up creditors, Dev Tools and the identity-check
 *          bypass are shown, and a banner says no real money moves.
 *   live — none of that.
 *
 * Set NEXT_PUBLIC_APP_STAGE at build time. Unset, a dev server is 'test' and a
 * production build is 'live', so forgetting it never exposes test tooling.
 */
export const APP_STAGE: 'test' | 'live' =
  process.env.NEXT_PUBLIC_APP_STAGE === 'test' || process.env.NEXT_PUBLIC_APP_STAGE === 'live'
    ? process.env.NEXT_PUBLIC_APP_STAGE
    : process.env.NODE_ENV === 'production' ? 'live' : 'test'

export const isTestStage = APP_STAGE === 'test'
