'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { paymentApi, formatPence } from '../../../lib/api'
import type { PaymentStatus } from '../../../lib/api'

export default function PaymentCompletePage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-navy flex items-center justify-center">
        <p className="text-mid-gray animate-pulse">Loading…</p>
      </main>
    }>
      <PaymentCompleteContent />
    </Suspense>
  )
}

/**
 * Polling strategy:
 * - Poll with gentle exponential backoff: 3s, 5s, 8s, 12s, 18s, 25s, 30s, 30s…
 * - Hard stop after MAX_POLL_MS (3 minutes) → show "still processing" terminal state
 * - 429 (rate limited) is NOT an error — we simply wait longer and retry
 * - Only network/404 errors after retries show the error state
 * - Payment reference always shown so the contributor can quote it to support
 */
const POLL_DELAYS_MS = [3000, 5000, 8000, 12000, 18000, 25000, 30000]
const MAX_POLL_MS = 3 * 60 * 1000 // 3 minutes total

type Phase = 'checking' | 'pending' | 'settled' | 'failed' | 'expired' | 'timeout' | 'error'

function PaymentCompleteContent() {
  const searchParams = useSearchParams()
  const paymentId = searchParams.get('payment_id')

  const [phase, setPhase] = useState<Phase>('checking')
  const [status, setStatus] = useState<PaymentStatus | null>(null)
  const [copied, setCopied] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Refs so the polling loop never re-triggers the effect
  const attemptRef = useRef(0)
  const startedAtRef = useRef<number>(0)
  const stoppedRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const consecutiveErrorsRef = useRef(0)

  useEffect(() => {
    if (!paymentId) {
      setErrorMsg('Payment reference missing from URL')
      setPhase('error')
      return
    }

    stoppedRef.current = false
    startedAtRef.current = Date.now()
    attemptRef.current = 0
    consecutiveErrorsRef.current = 0

    const scheduleNext = () => {
      if (stoppedRef.current) return

      // Hard timeout — stop polling, show terminal "still processing" state
      if (Date.now() - startedAtRef.current > MAX_POLL_MS) {
        setPhase('timeout')
        return
      }

      const idx = Math.min(attemptRef.current, POLL_DELAYS_MS.length - 1)
      timerRef.current = setTimeout(poll, POLL_DELAYS_MS[idx])
      attemptRef.current += 1
    }

    const poll = async () => {
      if (stoppedRef.current) return

      const result = await paymentApi.getStatus(paymentId)

      if (!result.ok) {
        // Rate limited or transient failure — back off and retry, don't alarm the user
        const isRateLimit =
          typeof result.error === 'string' &&
          /too many|rate|429/i.test(result.error)

        consecutiveErrorsRef.current += 1

        // Rate limits and the first few transient errors: silently retry
        if (isRateLimit || consecutiveErrorsRef.current < 4) {
          scheduleNext()
          return
        }

        // Persistent failure after several attempts — genuine error state
        setErrorMsg(
          'We could not confirm the payment status right now. ' +
          'This does not mean the payment failed.'
        )
        setPhase('error')
        return
      }

      consecutiveErrorsRef.current = 0
      setStatus(result.data)

      switch (result.data.status) {
        case 'settled':
          setPhase('settled')
          return // stop polling
        case 'failed':
          setPhase('failed')
          return // stop polling
        case 'expired':
          setPhase('expired')
          return // stop polling
        case 'pending':
        case 'initiated':
        default:
          setPhase('pending')
          scheduleNext()
      }
    }

    // First check immediately
    poll()

    return () => {
      stoppedRef.current = true
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [paymentId])

  const shortRef = paymentId ? paymentId.slice(0, 8).toUpperCase() : ''
  // Wording differs by how the payment was made (card checkout vs bank transfer)
  const paidByBank = status?.paymentMethod === 'bank_transfer'

  return (
    <main className="min-h-screen bg-navy flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md text-center">

        <div className="text-5xl mb-6">
          {phase === 'checking' && '⏳'}
          {phase === 'pending'  && '⏳'}
          {phase === 'settled'  && '✅'}
          {phase === 'failed'   && '❌'}
          {phase === 'expired'  && '⌛'}
          {phase === 'timeout'  && '🕐'}
          {phase === 'error'    && '⚠️'}
        </div>

        {phase === 'checking' && (
          <>
            <h1 className="text-2xl font-bold text-white mb-3">Checking payment status</h1>
            <p className="text-mid-gray">This usually takes a few seconds…</p>
          </>
        )}

        {phase === 'pending' && (
          <>
            <h1 className="text-2xl font-bold text-white mb-3">Payment in progress</h1>
            <p className="text-mid-gray mb-2">
              {paidByBank
                ? 'Your bank is processing the payment.'
                : 'We\u2019re confirming your payment.'}{' '}
              This page will update automatically — no need to refresh.
            </p>
            <p className="text-xs text-mid-gray/70">
              {paidByBank
                ? 'Payments usually settle within 90 seconds.'
                : 'This usually takes a few seconds.'}
            </p>
          </>
        )}

        {phase === 'settled' && status && (
          <>
            <h1 className="text-2xl font-bold text-white mb-3">Payment confirmed</h1>
            <p className="text-mid-gray mb-6">
              {formatPence(status.netAmountPence)} {paidByBank ? 'went directly to' : 'has been paid to'}{' '}
              <strong className="text-white">{status.creditorName}</strong>.
              You&apos;ll receive a confirmation email shortly.
            </p>

            {/* Receipt — printable, and this page stays at this URL so it can be revisited */}
            <div className="card text-left" id="receipt">
              <p className="text-xs uppercase tracking-wide text-mid-gray mb-2">Receipt</p>
              <div className="flex justify-between py-2">
                <span className="text-mid-gray text-sm">To {status.creditorName}</span>
                <span className="text-white font-medium">{formatPence(status.netAmountPence)}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-mid-gray text-sm">Bolster fee</span>
                <span className="text-white text-sm">{formatPence(status.feeAmountPence)}</span>
              </div>
              <div className="flex justify-between py-2 border-t border-blue-900/40 mt-1">
                <span className="text-white text-sm font-semibold">Total charged</span>
                <span className="text-white font-semibold">{formatPence(status.grossAmountPence)}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-mid-gray text-sm">Paid by</span>
                <span className="text-white text-sm">{paidByBank ? 'Bank transfer' : 'Card'}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-mid-gray text-sm">Date</span>
                <span className="text-white text-sm">
                  {new Date(status.settledAt ?? status.createdAt).toLocaleString('en-GB', {
                    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}
                </span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-mid-gray text-sm">Reference</span>
                <span className="text-white text-sm font-mono">{status.reference || shortRef}</span>
              </div>
            </div>

            <div className="flex gap-2 mt-4 print:hidden">
              <button
                type="button"
                className="btn-secondary text-sm py-2 flex-1"
                onClick={() => window.print()}
              >
                Save or print receipt
              </button>
              <button
                type="button"
                className="btn-secondary text-sm py-2 flex-1"
                onClick={() => {
                  void navigator.clipboard.writeText(window.location.href)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1500)
                }}
              >
                {copied ? 'Link copied' : 'Copy receipt link'}
              </button>
            </div>

            <p className="text-xs text-mid-gray mt-6 leading-relaxed print:hidden">
              The person you helped will receive a notification that their debt has been reduced.
              Thank you for stepping in. 💙
            </p>
          </>
        )}

        {phase === 'failed' && (
          <>
            <h1 className="text-2xl font-bold text-white mb-3">Payment not completed</h1>
            <p className="text-mid-gray mb-4">
              The payment was not completed and <strong className="text-white">no money
              has left your account</strong>. Please try again, or contact your{' '}
              {paidByBank ? 'bank' : 'card provider'} if the problem persists.
            </p>
            <p className="text-xs text-mid-gray mb-6">
              Reference: <span className="font-mono">{shortRef}</span>
            </p>
            <button
              type="button"
              className="btn-primary"
              onClick={() => history.back()}
            >
              ← Try again
            </button>
          </>
        )}

        {phase === 'expired' && (
          <>
            <h1 className="text-2xl font-bold text-white mb-3">This payment link has expired</h1>
            <p className="text-mid-gray mb-4">
              The checkout was not completed in time and <strong className="text-white">no money
              has left your account</strong>. You can start a new payment from the invite link.
            </p>
            <p className="text-xs text-mid-gray mb-6">
              Reference: <span className="font-mono">{shortRef}</span>
            </p>
            <button
              type="button"
              className="btn-primary"
              onClick={() => history.back()}
            >
              ← Start again
            </button>
          </>
        )}

        {phase === 'timeout' && (
          <>
            <h1 className="text-2xl font-bold text-white mb-3">Payment is still processing</h1>
            <p className="text-mid-gray mb-4">
              Your payment is taking longer than usual. This sometimes happens —
              you&apos;ll receive a confirmation email as soon as it settles.
              You can safely close this page.
            </p>
            <div className="card text-left mb-4">
              <div className="flex justify-between py-2">
                <span className="text-mid-gray text-sm">Payment reference</span>
                <span className="text-white text-sm font-mono">{shortRef}</span>
              </div>
            </div>
            <p className="text-xs text-mid-gray leading-relaxed">
              If you don&apos;t receive an email within 30 minutes, contact{' '}
              <a href={`mailto:support@bolsterfs.co.uk?subject=Payment%20${shortRef}`}
                 className="text-orange-400 underline">
                support@bolsterfs.co.uk
              </a>{' '}
              quoting the reference above. Never send a second payment without
              checking with us first.
            </p>
          </>
        )}

        {phase === 'error' && (
          <>
            <h1 className="text-2xl font-bold text-white mb-3">Unable to check status</h1>
            <p className="text-mid-gray mb-4">{errorMsg}</p>
            {shortRef && (
              <p className="text-xs text-mid-gray leading-relaxed">
                Your payment reference is{' '}
                <span className="font-mono text-white">{shortRef}</span>.
                You&apos;ll receive an email when the payment settles. If you&apos;re unsure,
                contact{' '}
                <a href={`mailto:support@bolsterfs.co.uk?subject=Payment%20${shortRef}`}
                   className="text-orange-400 underline">
                  support@bolsterfs.co.uk
                </a>{' '}
                — never send a second payment without checking first.
              </p>
            )}
          </>
        )}
      </div>
    </main>
  )
}
