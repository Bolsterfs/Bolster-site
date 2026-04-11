'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { debtApi, inviteApi } from '../../../../lib/api'
import type { Debt } from '../../../../lib/api'
import { useRequireAuth } from '../../../../lib/useRequireAuth'

// ── Types ─────────────────────────────────────────────────────────────────────

type PrivacyLevel = 'amount_only' | 'creditor_name' | 'full_balance'

const PRIVACY_OPTIONS: { value: PrivacyLevel; label: string; description: string }[] = [
  {
    value:       'amount_only',
    label:       'Amount only',
    description: 'Supporter sees how much to pay, but not who the creditor is',
  },
  {
    value:       'creditor_name',
    label:       'Creditor name + amount',
    description: 'Supporter sees the creditor name and the amount to pay',
  },
  {
    value:       'full_balance',
    label:       'Full balance',
    description: 'Supporter sees the creditor name and your total outstanding balance',
  },
]

const EXPIRY_OPTIONS = [
  { value: 7,  label: '7 days' },
  { value: 14, label: '14 days' },
  { value: 30, label: '30 days' },
  { value: 60, label: '60 days' },
  { value: 90, label: '90 days' },
]

const MAX_MESSAGE_LENGTH = 500

// ── Page ──────────────────────────────────────────────────────────────────────

export default function NewInvitePage() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const { isChecking } = useRequireAuth()

  // ── Data loading ────────────────────────────────────────────────────────
  const [debts,        setDebts]        = useState<Debt[]>([])
  const [debtsLoading, setDebtsLoading] = useState(true)
  const [debtsError,   setDebtsError]   = useState<string | null>(null)

  useEffect(() => {
    if (isChecking) return
    async function loadDebts() {
      const result = await debtApi.list()
      if (!result.ok) {
        setDebtsError('Could not load your debts. Please go back and try again.')
      } else {
        // Only CoP-verified debts can have invites created
        const verified = result.data.filter((d) => d.copVerified && d.status !== 'resolved')
        setDebts(verified)
      }
      setDebtsLoading(false)
    }
    void loadDebts()
  }, [isChecking])

  // ── Form state ──────────────────────────────────────────────────────────
  const preselectedDebtId = searchParams.get('debtId') ?? ''

  const [debtId,        setDebtId]        = useState(preselectedDebtId)
  const [privacyLevel,  setPrivacyLevel]  = useState<PrivacyLevel>('amount_only')
  const [message,       setMessage]       = useState('')
  const [maxAmount,     setMaxAmount]     = useState('')
  const [expiresInDays, setExpiresInDays] = useState(30)

  // Pre-select debtId once debts are loaded (handles the case where the query
  // param arrives before the list resolves)
  useEffect(() => {
    if (preselectedDebtId && debts.some((d) => d.id === preselectedDebtId)) {
      setDebtId(preselectedDebtId)
    } else if (!debtId && debts.length === 1) {
      setDebtId(debts[0].id)
    }
  }, [debts]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Submission ──────────────────────────────────────────────────────────
  const [submitting,  setSubmitting]  = useState(false)
  const [apiError,    setApiError]    = useState<string | null>(null)
  const [inviteUrl,   setInviteUrl]   = useState<string | null>(null)
  const [copied,      setCopied]      = useState(false)
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!debtId) return

    setSubmitting(true)
    setApiError(null)

    const maxAmountPence = maxAmount.trim()
      ? Math.round(parseFloat(maxAmount) * 100)
      : undefined

    const result = await inviteApi.create({
      debtId,
      privacyLevel,
      ...(message.trim()       ? { personalMessage: message.trim() }     : {}),
      ...(maxAmountPence       ? { maxAmountPence }                       : {}),
      expiresInDays,
    })

    setSubmitting(false)

    if (!result.ok) {
      setApiError(result.error)
      return
    }

    setInviteUrl(result.data.inviteUrl)
  }

  function handleCopy() {
    if (!inviteUrl) return
    void navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true)
      if (copyTimeout.current) clearTimeout(copyTimeout.current)
      copyTimeout.current = setTimeout(() => setCopied(false), 2000)
    })
  }

  // ── Loading states ──────────────────────────────────────────────────────

  if (isChecking || debtsLoading) {
    return (
      <div className="min-h-screen bg-navy flex items-center justify-center">
        <div className="text-mid-gray animate-pulse">Loading…</div>
      </div>
    )
  }

  // ── Success — show invite URL ────────────────────────────────────────────

  if (inviteUrl) {
    const selectedDebt = debts.find((d) => d.id === debtId)
    return (
      <div className="min-h-screen bg-navy flex flex-col">
        <header className="px-4 py-5 border-b border-blue-900/40">
          <div className="max-w-lg mx-auto flex items-center gap-4">
            <span className="text-white font-bold text-xl tracking-wide">BOLSTER</span>
          </div>
        </header>

        <main className="flex-1 flex items-start justify-center px-4 pt-12 pb-16">
          <div className="w-full max-w-md">
            {/* Success icon */}
            <div className="flex flex-col items-center mb-8">
              <div className="w-16 h-16 rounded-full bg-teal-900/40 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-white text-center">Invite link created</h1>
              {selectedDebt && (
                <p className="text-mid-gray text-sm mt-2 text-center">
                  For {selectedDebt.creditorName} · expires in {expiresInDays} days
                </p>
              )}
            </div>

            {/* URL display + copy */}
            <div className="card mb-4">
              <p className="text-xs text-mid-gray mb-2 font-medium uppercase tracking-wide">
                Your invite link
              </p>
              <p className="text-blue-300 text-sm break-all leading-relaxed mb-4 font-mono">
                {inviteUrl}
              </p>
              <button
                type="button"
                onClick={handleCopy}
                className={`btn-primary w-full transition-all ${copied ? 'bg-teal-700 hover:bg-teal-700' : ''}`}
              >
                {copied ? 'Copied!' : 'Copy link'}
              </button>
            </div>

            {/* Privacy reminder */}
            <div className="rounded-lg bg-blue-950/40 border border-blue-900/40 px-4 py-3 mb-6">
              <p className="text-xs text-mid-gray leading-relaxed">
                <span className="text-blue-300 font-medium">Privacy: </span>
                {PRIVACY_OPTIONS.find((p) => p.value === privacyLevel)?.description}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setInviteUrl(null)
                  setMessage('')
                  setMaxAmount('')
                  setExpiresInDays(30)
                  setPrivacyLevel('amount_only')
                  setApiError(null)
                }}
                className="btn-secondary flex-1 text-sm py-3"
              >
                Create another
              </button>
              <Link href="/dashboard" className="btn-primary flex-1 text-sm py-3 text-center">
                Dashboard
              </Link>
            </div>
          </div>
        </main>
      </div>
    )
  }

  // ── Form ─────────────────────────────────────────────────────────────────

  const selectedDebt  = debts.find((d) => d.id === debtId)
  const canSubmit     = !submitting && !!debtId

  return (
    <div className="min-h-screen bg-navy flex flex-col">
      <header className="px-4 py-5 border-b border-blue-900/40">
        <div className="max-w-lg mx-auto flex items-center gap-4">
          <Link
            href="/dashboard"
            className="text-mid-gray hover:text-white transition-colors text-lg leading-none"
            aria-label="Back to dashboard"
          >
            ←
          </Link>
          <span className="text-white font-bold text-xl tracking-wide">BOLSTER</span>
        </div>
      </header>

      <main className="flex-1 px-4 pt-8 pb-16">
        <div className="max-w-lg mx-auto">

          <div className="mb-8">
            <h1 className="text-2xl font-bold text-white">Create an invite link</h1>
            <p className="text-mid-gray text-sm mt-2">
              Share this privately with someone you trust. They&apos;ll pay your
              creditor directly — you stay in control of what they see.
            </p>
          </div>

          {/* No eligible debts */}
          {debtsError ? (
            <div className="card text-center py-10">
              <p className="text-red-400 text-sm">{debtsError}</p>
              <Link href="/dashboard" className="btn-secondary mt-4 inline-block px-6 py-2 text-sm">
                Back to dashboard
              </Link>
            </div>
          ) : debts.length === 0 ? (
            <div className="card text-center py-10">
              <p className="text-white font-semibold mb-2">No eligible debts</p>
              <p className="text-mid-gray text-sm mb-6">
                Debts must pass our account verification check before you can create
                invite links. This usually takes a moment — check back shortly.
              </p>
              <Link href="/dashboard" className="btn-secondary inline-block px-6 py-2 text-sm">
                Back to dashboard
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-6">

              {/* Debt selector */}
              <div>
                <label htmlFor="debtId" className="label">Which debt is this for?</label>
                <select
                  id="debtId"
                  value={debtId}
                  onChange={(e) => setDebtId(e.target.value)}
                  disabled={submitting}
                  className="w-full bg-navy border border-blue-900/60 rounded-lg px-4 py-3
                             text-white focus:outline-none focus:border-teal-400 focus:ring-1
                             focus:ring-teal-400 transition-colors duration-150
                             disabled:opacity-50"
                >
                  {!debtId && (
                    <option value="" disabled>Select a debt…</option>
                  )}
                  {debts.map((debt) => {
                    const remaining = debt.totalAmountPence - debt.paidAmountPence
                    const pounds    = (remaining / 100).toLocaleString('en-GB', {
                      style: 'currency', currency: 'GBP',
                    })
                    return (
                      <option key={debt.id} value={debt.id}>
                        {debt.creditorName} — {pounds} remaining
                      </option>
                    )
                  })}
                </select>
              </div>

              {/* Privacy level */}
              <div>
                <span className="label block mb-2">What can your supporter see?</span>
                <div className="space-y-2">
                  {PRIVACY_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-start gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
                        privacyLevel === opt.value
                          ? 'border-teal-500/60 bg-teal-900/20'
                          : 'border-blue-900/60 bg-navy hover:border-blue-700/60'
                      }`}
                    >
                      <input
                        type="radio"
                        name="privacyLevel"
                        value={opt.value}
                        checked={privacyLevel === opt.value}
                        onChange={() => setPrivacyLevel(opt.value)}
                        disabled={submitting}
                        className="mt-0.5 accent-teal-400 flex-shrink-0"
                      />
                      <div>
                        <p className="text-white text-sm font-medium">{opt.label}</p>
                        <p className="text-mid-gray text-xs mt-0.5">{opt.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Expiry */}
              <div>
                <label htmlFor="expiresInDays" className="label">Link expires after</label>
                <div className="flex gap-2 flex-wrap">
                  {EXPIRY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setExpiresInDays(opt.value)}
                      disabled={submitting}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        expiresInDays === opt.value
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'bg-transparent border-blue-900/60 text-mid-gray hover:border-blue-700/60 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Max contribution — optional */}
              <div>
                <label htmlFor="maxAmount" className="label">
                  Maximum contribution{' '}
                  <span className="text-mid-gray font-normal">(optional)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-mid-gray font-medium select-none">
                    £
                  </span>
                  <input
                    id="maxAmount"
                    type="text"
                    inputMode="decimal"
                    className="input pl-8"
                    placeholder="No limit"
                    value={maxAmount}
                    onChange={(e) => {
                      let val = e.target.value.replace(/[^\d.]/g, '')
                      const parts = val.split('.')
                      if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('')
                      const p2 = val.split('.')
                      if (p2.length === 2 && p2[1].length > 2) val = p2[0] + '.' + p2[1].slice(0, 2)
                      setMaxAmount(val)
                    }}
                    disabled={submitting}
                  />
                </div>
                <p className="text-xs text-mid-gray mt-1">
                  Cap how much this link can be used to pay
                </p>
              </div>

              {/* Personal message — optional */}
              <div>
                <label htmlFor="message" className="label">
                  Personal message{' '}
                  <span className="text-mid-gray font-normal">(optional)</span>
                </label>
                <textarea
                  id="message"
                  rows={4}
                  maxLength={MAX_MESSAGE_LENGTH}
                  className="w-full bg-navy border border-blue-900/60 rounded-lg px-4 py-3
                             text-white placeholder-gray-500 resize-none
                             focus:outline-none focus:border-teal-400 focus:ring-1
                             focus:ring-teal-400 transition-colors duration-150
                             disabled:opacity-50"
                  placeholder="Add a private note to your supporter — only they will see this…"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  disabled={submitting}
                />
                <p className={`text-xs mt-1 text-right ${
                  message.length > MAX_MESSAGE_LENGTH * 0.9 ? 'text-yellow-400' : 'text-mid-gray'
                }`}>
                  {message.length} / {MAX_MESSAGE_LENGTH}
                </p>
              </div>

              {/* Preview of what supporter will see */}
              {selectedDebt && (
                <div className="rounded-lg bg-blue-950/40 border border-blue-900/40 px-4 py-3">
                  <p className="text-xs text-mid-gray font-medium uppercase tracking-wide mb-2">
                    Supporter will see
                  </p>
                  <ul className="text-xs text-mid-gray space-y-1">
                    {(privacyLevel === 'creditor_name' || privacyLevel === 'full_balance') && (
                      <li className="text-white">
                        Creditor: <span className="text-blue-300">{selectedDebt.creditorName}</span>
                      </li>
                    )}
                    {privacyLevel === 'full_balance' && (
                      <li className="text-white">
                        Balance:{' '}
                        <span className="text-blue-300">
                          {((selectedDebt.totalAmountPence - selectedDebt.paidAmountPence) / 100)
                            .toLocaleString('en-GB', { style: 'currency', currency: 'GBP' })}
                        </span>
                      </li>
                    )}
                    {maxAmount && parseFloat(maxAmount) > 0 && (
                      <li className="text-white">
                        Max they can pay:{' '}
                        <span className="text-blue-300">
                          £{parseFloat(maxAmount).toFixed(2)}
                        </span>
                      </li>
                    )}
                    {message.trim() && (
                      <li className="text-white">
                        Your message: <span className="text-blue-300 italic">&ldquo;{message.trim().slice(0, 60)}{message.trim().length > 60 ? '…' : ''}&rdquo;</span>
                      </li>
                    )}
                    <li>Expires in <span className="text-white">{expiresInDays} days</span></li>
                  </ul>
                </div>
              )}

              {/* API error */}
              {apiError && (
                <div className="rounded-lg bg-red-950/60 border border-red-800/50 px-4 py-3">
                  <p className="error-text mt-0">{apiError}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <Link
                  href="/dashboard"
                  className="btn-secondary flex-1 text-center text-sm py-3"
                >
                  Cancel
                </Link>
                <button
                  type="submit"
                  className="btn-primary flex-1 text-sm"
                  disabled={!canSubmit}
                >
                  {submitting ? 'Creating…' : 'Create invite link'}
                </button>
              </div>

            </form>
          )}
        </div>
      </main>
    </div>
  )
}
