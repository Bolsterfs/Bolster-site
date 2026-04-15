'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { kycApi, setAccessToken, setRefreshToken } from '../../lib/api'

type PageState =
  | 'loading'        // creating Veriff session
  | 'redirecting'    // redirecting to Veriff
  | 'pending'        // returned from Veriff, awaiting decision
  | 'error'          // something went wrong

export default function KycPage() {
  const router     = useRouter()
  const [state,    setState]    = useState<PageState>('loading')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // On mount, check if we're returning from Veriff (poll status)
  // or need to start a new session
  useEffect(() => {
    void checkStatusOrInitiate()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function checkStatusOrInitiate() {
    // First check if KYC is already complete or in progress
    const statusResult = await kycApi.status()
    if (statusResult.ok) {
      if (statusResult.data.kycStatus === 'approved') {
        router.push('/dashboard')
        return
      }
      if (statusResult.data.kycStatus === 'in_progress') {
        // User has returned from Veriff — poll for result
        setState('pending')
        return
      }
    }

    // Start a new Veriff session
    const result = await kycApi.initiate()
    if (!result.ok) {
      setErrorMsg(result.error)
      setState('error')
      return
    }

    // Redirect to Veriff's hosted verification flow
    setState('redirecting')
    window.location.href = result.data.sessionUrl
  }

  // ── Dev bypass ───────────────────────────────────────────────────────────
  async function handleDevApprove() {
    const result = await kycApi.devApprove()
    if (!result.ok) {
      setErrorMsg(result.error)
      setState('error')
      return
    }
    setAccessToken(result.data.accessToken)
    setRefreshToken(result.data.refreshToken)
    router.push('/dashboard')
  }

  async function checkStatus() {
    const result = await kycApi.status()
    if (result.ok && result.data.kycStatus === 'approved') {
      router.push('/dashboard')
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-navy flex flex-col">
      <header className="px-4 py-5 border-b border-blue-900/40">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <span className="text-white font-bold text-xl tracking-wide">BOLSTER</span>
          {state === 'redirecting' && (
            <span className="badge-active">Redirecting…</span>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 pt-8 pb-16">
        <div className="w-full max-w-lg">

          {/* Loading — creating session */}
          {(state === 'loading' || state === 'redirecting') && (
            <div className="flex flex-col items-center justify-center py-24">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-mid-gray text-sm">
                {state === 'loading'
                  ? 'Preparing identity verification…'
                  : 'Redirecting to Veriff…'}
              </p>
            </div>
          )}

          {/* Pending — returned from Veriff, waiting for webhook decision */}
          {state === 'pending' && (
            <div className="card text-center py-12">
              <div className="w-16 h-16 rounded-full bg-teal-900/40 flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-white mb-3">Verification submitted</h2>
              <p className="text-mid-gray text-sm leading-relaxed max-w-sm mx-auto">
                We are reviewing your documents. This usually takes a few minutes.
                You will receive an email once your identity is confirmed.
              </p>
              <div className="mt-8 pt-6 border-t border-blue-900/40">
                <p className="text-xs text-mid-gray">
                  Already approved? Check your status below.
                </p>
                <button
                  className="btn-secondary mt-3 text-sm px-5 py-2"
                  onClick={() => void checkStatus()}
                >
                  Check status
                </button>
              </div>
            </div>
          )}

          {/* Error state */}
          {state === 'error' && (
            <div className="card text-center py-12">
              <div className="w-16 h-16 rounded-full bg-red-900/40 flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-white mb-3">Something went wrong</h2>
              <p className="text-mid-gray text-sm leading-relaxed max-w-sm mx-auto">
                {errorMsg ?? 'An unexpected error occurred. Please try again.'}
              </p>
              <button
                className="btn-primary mt-8"
                onClick={() => { setState('loading'); setErrorMsg(null); void checkStatusOrInitiate() }}
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </main>

      {process.env.NODE_ENV === 'development' && (
        <div className="border-t border-yellow-800/50 bg-yellow-950/30 px-4 py-3">
          <div className="max-w-lg mx-auto flex items-center justify-between gap-4">
            <p className="text-xs text-yellow-500/80">
              Dev mode — Veriff not required
            </p>
            <button
              type="button"
              onClick={() => void handleDevApprove()}
              className="text-xs px-3 py-1.5 rounded border border-yellow-700/60 text-yellow-400 hover:bg-yellow-900/40 transition-colors"
            >
              Skip KYC (dev only)
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
