'use client'

import { Suspense, useEffect, useState } from 'react'
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

function PaymentCompleteContent() {
  const searchParams = useSearchParams()
  const paymentId = searchParams.get('payment_id')
  const [status, setStatus] = useState<PaymentStatus | null>(null)
  const [error,  setError]  = useState('')
  const [polls,  setPolls]  = useState(0)

  useEffect(() => {
    if (!paymentId) {
      setError('Payment ID missing from URL')
      return
    }

    // Poll for payment status — TrueLayer settles in ~90 seconds
    const poll = async () => {
      const result = await paymentApi.getStatus(paymentId)
      if (!result.ok) {
        setError(result.error)
        return
      }

      setStatus(result.data)

      // Keep polling if still pending
      if (result.data.status === 'pending' || result.data.status === 'initiated') {
        setPolls((p) => p + 1)
      }
    }

    poll()
  }, [paymentId, polls])

  // Re-poll every 5 seconds while pending (max 6 polls = 30 seconds)
  useEffect(() => {
    if (status?.status === 'pending' && polls < 6) {
      const timer = setTimeout(() => setPolls((p) => p + 1), 5000)
      return () => clearTimeout(timer)
    }
  }, [status, polls])

  return (
    <main className="min-h-screen bg-navy flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="text-5xl mb-6">
          {!status && !error && '⏳'}
          {status?.status === 'settled'  && '✅'}
          {status?.status === 'failed'   && '❌'}
          {status?.status === 'pending'  && '⏳'}
          {error                         && '❌'}
        </div>

        {!status && !error && (
          <>
            <h1 className="text-2xl font-bold text-white mb-3">Checking payment status</h1>
            <p className="text-mid-gray">This usually takes a few seconds…</p>
          </>
        )}

        {status?.status === 'settled' && (
          <>
            <h1 className="text-2xl font-bold text-white mb-3">Payment confirmed</h1>
            <p className="text-mid-gray mb-6">
              {formatPence(status.netAmountPence)} went directly to the creditor.
              You&apos;ll receive a confirmation email shortly.
            </p>
            <div className="card text-left">
              <div className="flex justify-between py-2">
                <span className="text-mid-gray text-sm">Amount paid</span>
                <span className="text-white font-medium">{formatPence(status.netAmountPence)}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-mid-gray text-sm">Settled</span>
                <span className="text-white text-sm">
                  {status.settledAt
                    ? new Date(status.settledAt).toLocaleTimeString('en-GB')
                    : 'Just now'}
                </span>
              </div>
            </div>
            <p className="text-xs text-mid-gray mt-6 leading-relaxed">
              The person you helped will receive a notification that their debt has been reduced.
              Thank you for stepping in. 💙
            </p>
          </>
        )}

        {status?.status === 'failed' && (
          <>
            <h1 className="text-2xl font-bold text-white mb-3">Payment not completed</h1>
            <p className="text-mid-gray mb-4">
              The payment was not completed. No money has left your account.
              Please try again or contact your bank if the problem persists.
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

        {status?.status === 'pending' && polls >= 6 && (
          <>
            <h1 className="text-2xl font-bold text-white mb-3">Payment is processing</h1>
            <p className="text-mid-gray">
              Your payment is being processed. You&apos;ll receive a confirmation email
              when it settles — usually within a few minutes.
            </p>
          </>
        )}

        {error && (
          <>
            <h1 className="text-2xl font-bold text-white mb-3">Unable to check status</h1>
            <p className="text-mid-gray">{error}</p>
          </>
        )}
      </div>
    </main>
  )
}
