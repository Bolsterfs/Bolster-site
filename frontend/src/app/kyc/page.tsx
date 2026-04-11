'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { kycApi, setAccessToken, setRefreshToken } from '../../lib/api'

// Onfido SDK types — loaded from CDN at runtime
declare global {
  interface Window {
    Onfido?: {
      init: (config: OnfidoConfig) => OnfidoInstance
    }
  }
}

interface OnfidoConfig {
  token:       string
  containerId: string
  steps:       string[]
  onComplete:  (data: unknown) => void
  onError:     (error: unknown) => void
  onUserExit:  (reason: string) => void
}

interface OnfidoInstance {
  tearDown: () => void
}

type PageState =
  | 'loading'        // fetching SDK token
  | 'ready'          // SDK mounted, user doing verification
  | 'submitting'     // calling /kyc/submit
  | 'pending'        // check submitted, awaiting Onfido result
  | 'error'          // something went wrong

const ONFIDO_SDK_URL = 'https://sdk.onfido.com/v14/onfido.min.js'
const ONFIDO_CSS_URL = 'https://sdk.onfido.com/v14/style.css'

export default function KycPage() {
  const router      = useRouter()
  const onfidoRef   = useRef<OnfidoInstance | null>(null)
  const [state,     setState]     = useState<PageState>('loading')
  const [errorMsg,  setErrorMsg]  = useState<string | null>(null)
  const [sdkToken,  setSdkToken]  = useState<string | null>(null)

  // ── Step 1: fetch SDK token ─────────────────────────────────────────────
  useEffect(() => {
    async function fetchToken() {
      const result = await kycApi.initiate()
      if (!result.ok) {
        setErrorMsg(result.error)
        setState('error')
        return
      }
      setSdkToken(result.data.sdkToken)
    }
    void fetchToken()
  }, [])

  // ── Step 2: inject Onfido CSS + SDK, then mount when both are ready ─────
  useEffect(() => {
    if (!sdkToken) return

    // Inject stylesheet
    if (!document.querySelector(`link[href="${ONFIDO_CSS_URL}"]`)) {
      const link = document.createElement('link')
      link.rel  = 'stylesheet'
      link.href = ONFIDO_CSS_URL
      document.head.appendChild(link)
    }

    // Inject SDK script if not already loaded
    if (window.Onfido) {
      mountSdk(sdkToken)
      return
    }

    const script   = document.createElement('script')
    script.src     = ONFIDO_SDK_URL
    script.async   = true
    script.onload  = () => mountSdk(sdkToken)
    script.onerror = () => {
      setErrorMsg('Could not load the identity verification module. Check your connection and try again.')
      setState('error')
    }
    document.body.appendChild(script)

    return () => {
      onfidoRef.current?.tearDown()
    }
  }, [sdkToken]) // eslint-disable-line react-hooks/exhaustive-deps

  function mountSdk(token: string) {
    if (!window.Onfido) return

    onfidoRef.current = window.Onfido.init({
      token,
      containerId: 'onfido-mount',
      steps:       ['welcome', 'document', 'face'],

      onComplete: (_data) => {
        void handleComplete()
      },

      onError: (err) => {
        console.error('Onfido SDK error', err)
        setErrorMsg('An error occurred during verification. Please try again.')
        setState('error')
      },

      onUserExit: (_reason) => {
        // User closed the SDK without completing — leave them on the page
        setState('ready')
      },
    })

    setState('ready')
  }

  // ── Step 3: submit check after SDK flow completes ───────────────────────
  async function handleComplete() {
    setState('submitting')
    onfidoRef.current?.tearDown()

    const result = await kycApi.submit()
    if (!result.ok) {
      setErrorMsg(result.error)
      setState('error')
      return
    }

    setState('pending')
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

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-navy flex flex-col">
      <header className="px-4 py-5 border-b border-blue-900/40">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <span className="text-white font-bold text-xl tracking-wide">BOLSTER</span>
          {state === 'ready' && (
            <span className="badge-active">Verifying identity</span>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 pt-8 pb-16">
        <div className="w-full max-w-lg">

          {/* Loading — fetching SDK token */}
          {state === 'loading' && (
            <div className="flex flex-col items-center justify-center py-24">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-mid-gray text-sm">Preparing identity verification…</p>
            </div>
          )}

          {/* SDK mounted — Onfido controls this div */}
          {(state === 'ready' || state === 'submitting') && (
            <div>
              <div className="mb-6">
                <h1 className="text-xl font-bold text-white">Verify your identity</h1>
                <p className="text-mid-gray text-sm mt-1">
                  UK regulations require us to confirm your identity before you can use Bolster.
                  This takes about 2 minutes.
                </p>
              </div>
              {/* Onfido SDK mounts here */}
              <div
                id="onfido-mount"
                className="rounded-xl overflow-hidden min-h-[480px] bg-[#162046]"
              />
              {state === 'submitting' && (
                <div className="flex items-center justify-center gap-2 mt-4 text-mid-gray text-sm">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  Submitting verification…
                </div>
              )}
            </div>
          )}

          {/* Pending — check submitted, waiting for result */}
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
                  Already approved? Refresh to check your status.
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
                onClick={() => { setState('loading'); setSdkToken(null); setErrorMsg(null) }}
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
              Dev mode — Onfido not required
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

  async function checkStatus() {
    const result = await kycApi.status()
    if (result.ok && result.data.kycStatus === 'approved') {
      router.push('/dashboard')
    }
  }
}
