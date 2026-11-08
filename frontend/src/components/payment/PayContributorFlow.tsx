'use client'

import { useEffect, useState } from 'react'
import { paymentApi, formatPence } from '../../lib/api'
import type { PaymentQuote, ResolvedInvite, ResolvedInviteDebt } from '../../lib/api'

interface Props {
  inviteToken: string
  invite:      ResolvedInvite
  selectedDebt: ResolvedInviteDebt
}

type Step = 'amount' | 'details' | 'confirm' | 'redirecting' | 'error'

/** Smallest amount we ask the server to price — matches the £1 form minimum. */
const MIN_QUOTE_PENCE = 100
/** Wait for typing to pause before asking the server for a quote. */
const QUOTE_DEBOUNCE_MS = 300

/**
 * Which fee rule applied to this amount, in plain words. The figures themselves
 * always come from the server quote — this only explains them.
 */
function feeRuleLabel(quote: PaymentQuote): string {
  const { percentage, minFeePence, maxFeePence } = quote.feePolicy
  const percentageFeePence = Math.round(quote.netAmountPence * (percentage / 100))
  if (percentageFeePence < minFeePence) return `Our minimum fee (usually ${percentage}%)`
  if (percentageFeePence > maxFeePence) return `Capped at our maximum fee`
  return `${percentage}% of the amount you give`
}

/** The fee breakdown, shown on the amount step and again before paying. */
function FeeBreakdown({ quote, creditorLabel }: { quote: PaymentQuote; creditorLabel: string }) {
  return (
    <dl className="rounded-lg border border-blue-900/40 bg-navy px-4 py-1">
      <div className="flex justify-between gap-4 py-3 border-b border-blue-900/40">
        <dt className="text-mid-gray">{creditorLabel} receives</dt>
        <dd className="text-white font-medium tabular-nums">{formatPence(quote.netAmountPence)}</dd>
      </div>
      <div className="flex justify-between gap-4 py-3 border-b border-blue-900/40">
        <dt className="text-mid-gray">
          Bolster fee
          <span className="block text-xs text-mid-gray/80 mt-0.5">{feeRuleLabel(quote)}</span>
        </dt>
        <dd className="text-white font-medium tabular-nums">{formatPence(quote.feeAmountPence)}</dd>
      </div>
      <div className="flex justify-between gap-4 py-3">
        <dt className="text-white font-semibold">You pay</dt>
        <dd className="text-white font-bold text-lg tabular-nums">{formatPence(quote.grossAmountPence)}</dd>
      </div>
    </dl>
  )
}

export default function PayContributorFlow({ inviteToken, invite, selectedDebt }: Props) {
  const [step,            setStep]           = useState<Step>('amount')
  const [amountPounds,    setAmountPounds]   = useState('')
  const [contributorName, setContributorName] = useState('')
  const [contributorEmail, setContributorEmail] = useState('')
  const [error,           setError]          = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // Server-calculated fee breakdown for the amount currently entered.
  const [quote,        setQuote]        = useState<PaymentQuote | null>(null)
  const [quoteFailure, setQuoteFailure] = useState<{ amountPence: number; message: string } | null>(null)
  const [quoteRetry,   setQuoteRetry]   = useState(0)

  const parsedPounds = parseFloat(amountPounds || '0')
  const amountPence  = Number.isFinite(parsedPounds) ? Math.round(parsedPounds * 100) : 0

  const maxAmountPounds = invite.inviteMaxAmountPence
    ? invite.inviteMaxAmountPence / 100
    : null

  const remainingPence = selectedDebt.remainingAmountPence ?? null
  const remainingPounds = remainingPence != null ? remainingPence / 100 : null
  const isFullyPaid = remainingPence != null && remainingPence <= 0

  // Effective max: the lesser of invite max and remaining balance
  const effectiveMaxPounds = (() => {
    if (maxAmountPounds && remainingPounds) return Math.min(maxAmountPounds, remainingPounds)
    return maxAmountPounds ?? remainingPounds
  })()

  const creditorLabel = selectedDebt.creditorName ?? 'The creditor'
  const creditorInline = selectedDebt.creditorName ?? 'the creditor'

  // Reasons the entered amount can't be paid, checked before asking for a quote.
  const amountProblem = (() => {
    if (!amountPounds) return null
    if (amountPence < MIN_QUOTE_PENCE) return 'Please enter an amount of at least £1.00'
    if (remainingPence != null && amountPence > remainingPence) {
      return `Amount cannot exceed the outstanding balance of ${formatPence(remainingPence)}`
    }
    if (invite.inviteMaxAmountPence && amountPence > invite.inviteMaxAmountPence) {
      return `Maximum contribution is ${formatPence(invite.inviteMaxAmountPence)}`
    }
    return null
  })()

  const canQuote     = amountPence >= MIN_QUOTE_PENCE && !amountProblem
  // A quote only counts if it is for exactly the amount on screen.
  const activeQuote  = canQuote && quote?.netAmountPence === amountPence ? quote : null
  const quoteError   = canQuote && quoteFailure?.amountPence === amountPence ? quoteFailure.message : null
  const quoteLoading = canQuote && !activeQuote && !quoteError

  // ── Live fee quote ────────────────────────────────────────────────────────
  // Ask the server for the exact breakdown shortly after the amount changes,
  // so the contributor sees the fee and total before going any further.
  useEffect(() => {
    if (!canQuote) return

    const controller = new AbortController()
    const timer = setTimeout(() => {
      void paymentApi.quote(amountPence, controller.signal).then((result) => {
        if (controller.signal.aborted) return
        if (result.ok) {
          setQuote(result.data)
          setQuoteFailure(null)
        } else {
          setQuoteFailure({ amountPence, message: result.error })
        }
      })
    }, QUOTE_DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [amountPence, canQuote, quoteRetry])

  // ── Step 1: amount entry ──────────────────────────────────────────────────
  function handleAmountSubmit() {
    setError('')
    if (!amountPounds || amountPence < MIN_QUOTE_PENCE) {
      setError('Please enter an amount of at least £1.00')
      return
    }
    if (amountProblem) {
      setError(amountProblem)
      return
    }
    // Never move on without the fee on screen.
    if (!activeQuote) return
    setStep('details')
  }

  // ── Step 2: contributor details ───────────────────────────────────────────
  function handleDetailsSubmit() {
    setError('')
    if (!contributorName.trim()) {
      setError('Please enter your name')
      return
    }
    if (!contributorEmail.trim() || !contributorEmail.includes('@')) {
      setError('Please enter a valid email address')
      return
    }
    setStep('confirm')
  }

  // ── Step 3: confirm + initiate ────────────────────────────────────────────
  async function handleConfirm() {
    if (!activeQuote) return

    setIsLoading(true)
    setError('')

    const result = await paymentApi.initiate({
      inviteToken,
      debtId: selectedDebt.id,
      amountPence,
      contributorEmail: contributorEmail.trim(),
      contributorName:  contributorName.trim(),
      // The server refuses the payment if its total differs from this one.
      expectedGrossAmountPence: activeQuote.grossAmountPence,
    })

    if (!result.ok) {
      // The fee changed since it was shown — fetch the new breakdown and ask
      // the contributor to confirm again rather than charging a new total.
      if (result.code === 'QUOTE_CHANGED') {
        const refreshed = await paymentApi.quote(amountPence)
        setIsLoading(false)
        if (refreshed.ok) {
          setQuote(refreshed.data)
          setError('The total has changed since you last saw it. Please check the updated amount below before paying.')
          return
        }
      }

      setIsLoading(false)
      setStep('error')
      setError(result.error)
      return
    }

    setStep('redirecting')

    // Small delay so user sees the redirecting state before browser navigates
    setTimeout(() => {
      window.location.href = result.data.authUri
    }, 1000)
  }

  const paysByCard = activeQuote?.paymentMethod === 'card'

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {step === 'amount' && isFullyPaid && (
        <div className="card text-center py-8">
          <div className="text-4xl mb-4">✅</div>
          <h2 className="text-white font-semibold mb-2">This debt has been fully paid</h2>
          <p className="text-mid-gray text-sm">
            Great news — this bill has already been settled. No further payments are needed.
          </p>
        </div>
      )}

      {step === 'amount' && !isFullyPaid && (
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-1">How much would you like to pay?</h2>
          {remainingPounds != null && (
            <p className="text-sm text-mid-gray mb-4">
              Maximum: <span className="text-white font-medium">£{remainingPounds.toFixed(2)}</span>
              <span className="text-mid-gray"> (full outstanding balance)</span>
            </p>
          )}

          <div className="mb-4">
            <label className="label" htmlFor="contribution-amount">Amount (£)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg">£</span>
              <input
                id="contribution-amount"
                type="number"
                inputMode="decimal"
                className="input pl-8"
                placeholder="0.00"
                min="1"
                max={effectiveMaxPounds ?? undefined}
                step="0.01"
                value={amountPounds}
                onChange={(e) => { setAmountPounds(e.target.value); setError('') }}
                onKeyDown={(e) => e.key === 'Enter' && handleAmountSubmit()}
                aria-describedby="fee-breakdown"
                autoFocus
              />
            </div>
            {(error || amountProblem) && <p className="error-text">{error || amountProblem}</p>}
          </div>

          {/* Quick amount buttons — only show amounts within remaining balance */}
          <div className="grid grid-cols-3 gap-2 mb-5">
            {[25, 50, 100]
              .filter((amt) => !effectiveMaxPounds || amt <= effectiveMaxPounds)
              .map((amt) => (
                <button
                  key={amt}
                  type="button"
                  className="border border-blue-800 rounded-lg py-2 text-sm text-mid-gray hover:border-teal-500 hover:text-teal-400 transition-colors"
                  onClick={() => { setAmountPounds(String(amt)); setError('') }}
                >
                  £{amt}
                </button>
              ))}
          </div>

          {/* Fee breakdown — visible as soon as there is an amount to price */}
          <div id="fee-breakdown" aria-live="polite" className="mb-5">
            {activeQuote && (
              <>
                <FeeBreakdown quote={activeQuote} creditorLabel={creditorLabel} />
                <p className="text-xs text-mid-gray leading-relaxed mt-3">
                  Our fee is {activeQuote.feePolicy.percentage}% of what you give, with a minimum
                  of {formatPence(activeQuote.feePolicy.minFeePence)} and a maximum
                  of {formatPence(activeQuote.feePolicy.maxFeePence)}. It is added on top,
                  so {creditorInline} receives the full {formatPence(activeQuote.netAmountPence)}.
                </p>
              </>
            )}

            {quoteLoading && (
              <p className="text-sm text-mid-gray animate-pulse">Working out the fee…</p>
            )}

            {quoteError && (
              <div className="rounded-lg border border-red-900/50 bg-red-900/20 px-4 py-3">
                <p className="text-sm text-red-300">
                  We couldn&apos;t work out the fee for this amount. {quoteError}
                </p>
                <button
                  type="button"
                  className="text-sm text-teal-400 hover:text-teal-300 font-medium mt-2"
                  onClick={() => { setQuoteFailure(null); setQuoteRetry((n) => n + 1) }}
                >
                  Try again
                </button>
              </div>
            )}

            {!amountPounds && (
              <p className="text-xs text-mid-gray leading-relaxed">
                Enter an amount to see our fee and the total you&apos;ll pay. The fee is added on
                top, so the full amount you choose goes to {creditorInline}.
              </p>
            )}
          </div>

          <button
            type="button"
            className="btn-primary w-full"
            onClick={handleAmountSubmit}
            disabled={!activeQuote}
          >
            {quoteLoading ? 'Working out the fee…' : 'Continue →'}
          </button>
        </div>
      )}

      {step === 'details' && (
        <div className="card">
          <button
            type="button"
            className="text-mid-gray text-sm mb-4 flex items-center gap-1 hover:text-white"
            onClick={() => { setStep('amount'); setError('') }}
          >
            ← Back
          </button>
          <h2 className="text-lg font-semibold text-white mb-4">Your details</h2>
          <p className="text-sm text-mid-gray mb-5">
            We need these for your payment confirmation. Your details are not shared with {invite.recipientFirstName}.
          </p>

          <div className="space-y-4 mb-5">
            <div>
              <label className="label" htmlFor="contributor-name">Your full name</label>
              <input
                id="contributor-name"
                type="text"
                className="input"
                placeholder="Jane Smith"
                value={contributorName}
                onChange={(e) => setContributorName(e.target.value)}
                autoComplete="name"
              />
            </div>
            <div>
              <label className="label" htmlFor="contributor-email">Your email address</label>
              <input
                id="contributor-email"
                type="email"
                className="input"
                placeholder="jane@example.com"
                value={contributorEmail}
                onChange={(e) => setContributorEmail(e.target.value)}
                autoComplete="email"
              />
              <p className="text-xs text-mid-gray mt-1">
                We&apos;ll send your payment confirmation here
              </p>
            </div>
          </div>

          {error && <p className="error-text mb-3">{error}</p>}

          <button
            type="button"
            className="btn-primary w-full"
            onClick={handleDetailsSubmit}
          >
            Review payment →
          </button>
        </div>
      )}

      {step === 'confirm' && (
        <div className="card">
          <button
            type="button"
            className="text-mid-gray text-sm mb-4 flex items-center gap-1 hover:text-white"
            onClick={() => { setStep('details'); setError('') }}
            disabled={isLoading}
          >
            ← Back
          </button>
          <h2 className="text-lg font-semibold text-white mb-5">Review your payment</h2>

          {activeQuote ? (
            <>
              <p className="text-sm text-mid-gray mb-3">
                Payment to{' '}
                <span className="text-white font-medium">{selectedDebt.creditorName ?? 'Creditor'}</span>
              </p>

              <div className="mb-5">
                <FeeBreakdown quote={activeQuote} creditorLabel={creditorLabel} />
              </div>

              <div className="bg-navy rounded-lg p-4 mb-5 border border-blue-900/30">
                <p className="text-xs text-mid-gray leading-relaxed">
                  {paysByCard ? (
                    <>
                      You&apos;ll be taken to a secure checkout to pay {formatPence(activeQuote.grossAmountPence)} by
                      card. {creditorLabel} receives the full {formatPence(activeQuote.netAmountPence)} and
                      the {formatPence(activeQuote.feeAmountPence)} fee goes to Bolster. Nothing is
                      taken until you confirm on the next screen.
                    </>
                  ) : (
                    <>
                      You&apos;ll be redirected to your bank to authorise this payment securely.
                      Money goes directly to {creditorInline} via UK Faster Payments.
                      Bolster never holds your funds.
                    </>
                  )}
                </p>
              </div>

              {error && <p className="error-text mb-3" role="alert">{error}</p>}

              <button
                type="button"
                className="btn-primary w-full"
                onClick={handleConfirm}
                disabled={isLoading}
              >
                {isLoading
                  ? 'Setting up payment...'
                  : paysByCard
                    ? `Pay ${formatPence(activeQuote.grossAmountPence)} →`
                    : `Pay ${formatPence(activeQuote.grossAmountPence)} with my bank →`}
              </button>

              <p className="text-xs text-mid-gray text-center mt-3">
                Total {formatPence(activeQuote.grossAmountPence)}, including
                the {formatPence(activeQuote.feeAmountPence)} Bolster fee. No other charges.
              </p>
            </>
          ) : (
            // Only reachable if the quote was lost — send them back to re-price.
            <div className="text-center py-4">
              <p className="text-sm text-mid-gray mb-4">
                We need to re-check the fee for this payment before you continue.
              </p>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => { setStep('amount'); setError('') }}
              >
                Check the amount
              </button>
            </div>
          )}
        </div>
      )}

      {step === 'redirecting' && (
        <div className="card text-center py-8">
          <div className="text-4xl mb-4 animate-pulse">🔒</div>
          <h2 className="text-white font-semibold mb-2">
            {paysByCard ? 'Taking you to secure checkout' : 'Taking you to your bank'}
          </h2>
          <p className="text-mid-gray text-sm">
            {paysByCard
              ? 'Complete your payment on the secure checkout page'
              : 'Complete the payment securely with your bank’s own authentication'}
          </p>
        </div>
      )}

      {step === 'error' && (
        <div className="card text-center py-8">
          <div className="text-4xl mb-4">❌</div>
          <h2 className="text-white font-semibold mb-2">Something went wrong</h2>
          <p className="text-mid-gray text-sm mb-5">{error}</p>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => { setStep('amount'); setError('') }}
          >
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
