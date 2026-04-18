'use client'

import { useState } from 'react'
import { paymentApi, formatPence } from '../../lib/api'
import type { ResolvedInvite, ResolvedInviteDebt } from '../../lib/api'

interface Props {
  inviteToken: string
  invite:      ResolvedInvite
  selectedDebt: ResolvedInviteDebt
}

type Step = 'amount' | 'details' | 'confirm' | 'redirecting' | 'error'

export default function PayContributorFlow({ inviteToken, invite, selectedDebt }: Props) {
  const [step,            setStep]           = useState<Step>('amount')
  const [amountPounds,    setAmountPounds]   = useState('')
  const [contributorName, setContributorName] = useState('')
  const [contributorEmail, setContributorEmail] = useState('')
  const [error,           setError]          = useState('')
  const [feeInfo,         setFeeInfo]        = useState<{
    feeAmountPence:   number
    grossAmountPence: number
    netAmountPence:   number
  } | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const amountPence = Math.round(parseFloat(amountPounds || '0') * 100)

  const maxAmountPounds = invite.inviteMaxAmountPence
    ? invite.inviteMaxAmountPence / 100
    : null

  const remainingPounds = selectedDebt.remainingAmountPence
    ? selectedDebt.remainingAmountPence / 100
    : null

  // ── Step 1: amount entry ──────────────────────────────────────────────────
  function handleAmountSubmit() {
    setError('')
    if (!amountPounds || parseFloat(amountPounds) < 1) {
      setError('Please enter an amount of at least £1.00')
      return
    }
    if (maxAmountPounds && parseFloat(amountPounds) > maxAmountPounds) {
      setError(`Maximum contribution is ${formatPence(invite.inviteMaxAmountPence!)}`)
      return
    }
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
    setIsLoading(true)
    setError('')

    const result = await paymentApi.initiate({
      inviteToken,
      debtId: selectedDebt.id,
      amountPence,
      contributorEmail: contributorEmail.trim(),
      contributorName:  contributorName.trim(),
    })

    if (!result.ok) {
      setIsLoading(false)
      setStep('error')
      setError(result.error)
      return
    }

    setFeeInfo({
      feeAmountPence:   result.data.feeAmountPence,
      grossAmountPence: result.data.grossAmountPence,
      netAmountPence:   result.data.netAmountPence,
    })

    setStep('redirecting')

    // Small delay so user sees the redirecting state before browser navigates
    setTimeout(() => {
      window.location.href = result.data.authUri
    }, 1000)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {step === 'amount' && (
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-1">How much would you like to pay?</h2>
          {remainingPounds && (
            <p className="text-sm text-mid-gray mb-4">
              Outstanding amount: <span className="text-white font-medium">£{remainingPounds.toFixed(2)}</span>
            </p>
          )}

          <div className="mb-4">
            <label className="label">Amount (£)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg">£</span>
              <input
                type="number"
                className="input pl-8"
                placeholder="0.00"
                min="1"
                max={maxAmountPounds ?? undefined}
                step="0.01"
                value={amountPounds}
                onChange={(e) => setAmountPounds(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAmountSubmit()}
                autoFocus
              />
            </div>
            {error && <p className="error-text">{error}</p>}
          </div>

          {/* Quick amount buttons */}
          <div className="grid grid-cols-3 gap-2 mb-5">
            {[25, 50, 100].map((amt) => (
              <button
                key={amt}
                type="button"
                className="border border-blue-800 rounded-lg py-2 text-sm text-mid-gray hover:border-teal-500 hover:text-teal-400 transition-colors"
                onClick={() => setAmountPounds(String(amt))}
              >
                £{amt}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="btn-primary w-full"
            onClick={handleAmountSubmit}
            disabled={!amountPounds || parseFloat(amountPounds) <= 0}
          >
            Continue →
          </button>
        </div>
      )}

      {step === 'details' && (
        <div className="card">
          <button
            type="button"
            className="text-mid-gray text-sm mb-4 flex items-center gap-1 hover:text-white"
            onClick={() => setStep('amount')}
          >
            ← Back
          </button>
          <h2 className="text-lg font-semibold text-white mb-4">Your details</h2>
          <p className="text-sm text-mid-gray mb-5">
            We need these for your payment confirmation. Your details are not shared with {invite.recipientFirstName}.
          </p>

          <div className="space-y-4 mb-5">
            <div>
              <label className="label">Your full name</label>
              <input
                type="text"
                className="input"
                placeholder="Jane Smith"
                value={contributorName}
                onChange={(e) => setContributorName(e.target.value)}
                autoComplete="name"
              />
            </div>
            <div>
              <label className="label">Your email address</label>
              <input
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
            onClick={() => setStep('details')}
          >
            ← Back
          </button>
          <h2 className="text-lg font-semibold text-white mb-5">Review your payment</h2>

          <div className="space-y-3 mb-6">
            <div className="flex justify-between py-3 border-b border-blue-900/40">
              <span className="text-mid-gray">Payment to</span>
              <span className="text-white font-medium">
                {selectedDebt.creditorName ?? 'Creditor'}
              </span>
            </div>
            <div className="flex justify-between py-3 border-b border-blue-900/40">
              <span className="text-mid-gray">Amount to creditor</span>
              <span className="text-white font-medium">{formatPence(amountPence)}</span>
            </div>
            <div className="flex justify-between py-3 border-b border-blue-900/40">
              <span className="text-mid-gray">Bolster service fee (1.5%)</span>
              <span className="text-mid-gray">
                {/* Fee calculated server-side — shown after initiation */}
                ~{formatPence(Math.max(100, Math.min(1500, Math.round(amountPence * 0.015))))}
              </span>
            </div>
            <div className="flex justify-between py-3">
              <span className="text-white font-semibold">You pay total</span>
              <span className="text-white font-bold text-lg">
                ~{formatPence(amountPence + Math.max(100, Math.min(1500, Math.round(amountPence * 0.015))))}
              </span>
            </div>
          </div>

          <div className="bg-navy rounded-lg p-4 mb-5 border border-blue-900/30">
            <p className="text-xs text-mid-gray leading-relaxed">
              You&apos;ll be redirected to your bank to authorise this payment securely.
              Money goes directly to {selectedDebt.creditorName ?? 'the creditor'} via UK Faster Payments.
              Bolster never holds your funds.
            </p>
          </div>

          {error && <p className="error-text mb-3">{error}</p>}

          <button
            type="button"
            className="btn-primary w-full"
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Setting up payment...' : 'Pay with my bank →'}
          </button>
        </div>
      )}

      {step === 'redirecting' && (
        <div className="card text-center py-8">
          <div className="text-4xl mb-4 animate-pulse">🔒</div>
          <h2 className="text-white font-semibold mb-2">Taking you to your bank</h2>
          <p className="text-mid-gray text-sm">
            Complete the payment securely with your bank&apos;s own authentication
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
