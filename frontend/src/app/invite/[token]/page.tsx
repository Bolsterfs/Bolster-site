'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import PayContributorFlow from '../../../components/payment/PayContributorFlow'
import { formatPence } from '../../../lib/api'
import type { ResolvedInvite, ResolvedInviteDebt } from '../../../lib/api'

export default function InvitePage() {
  const params = useParams<{ token: string }>()
  const token = params.token

  const [invite, setInvite] = useState<ResolvedInvite | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedDebt, setSelectedDebt] = useState<ResolvedInviteDebt | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch(`/api/v1/invites/resolve/${token}`)
        if (!response.ok) {
          setError('This invite link is no longer valid.')
          return
        }
        const body = await response.json() as { success: boolean; data: ResolvedInvite }
        if (!body.success) {
          setError('This invite link is no longer valid.')
          return
        }
        setInvite(body.data)
        // Auto-select if only one debt
        if (body.data.debts.length === 1) {
          setSelectedDebt(body.data.debts[0])
        }
      } catch {
        setError('Unable to load invite. Please try again.')
      }
    }
    void load()
  }, [token])

  // ── Loading ──────────────────────────────────────────────────────────────
  if (!invite && !error) {
    return (
      <main className="min-h-screen bg-navy flex items-center justify-center">
        <p className="text-mid-gray animate-pulse">Loading…</p>
      </main>
    )
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <main className="min-h-screen bg-navy flex flex-col items-center justify-center px-4">
        <div className="text-4xl mb-4">😔</div>
        <h1 className="text-xl font-bold text-white mb-2">Invite not available</h1>
        <p className="text-mid-gray text-sm text-center">{error}</p>
      </main>
    )
  }

  if (!invite) return null

  return (
    <main className="min-h-screen bg-navy flex flex-col">
      {/* Top bar */}
      <header className="px-4 py-4 border-b border-blue-900/40">
        <div className="max-w-md mx-auto flex items-center gap-2">
          <span className="text-white font-bold text-xl tracking-wide">BOLSTER</span>
          <span className="text-mid-gray text-sm">· Secure payment</span>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-start px-4 py-8">
        <div className="w-full max-w-md">
          {/* Greeting */}
          <div className="mb-8 text-center">
            <div className="w-16 h-16 bg-teal-900/40 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">💙</span>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">
              {invite.recipientFirstName} needs your help
            </h1>
            <p className="text-mid-gray text-sm leading-relaxed">
              You&apos;ve been invited to help with a payment.
              Your money goes directly to the creditor — not to {invite.recipientFirstName}.
            </p>
          </div>

          {/* Personal message */}
          {invite.personalMessage && (
            <div className="card mb-6 border-l-4 border-l-teal-500">
              <p className="text-sm text-mid-gray mb-1">Message from {invite.recipientFirstName}</p>
              <p className="text-white italic">&ldquo;{invite.personalMessage}&rdquo;</p>
            </div>
          )}

          {/* Debt selection — only shown when multiple debts and none selected yet */}
          {!selectedDebt && invite.debts.length > 1 && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-white mb-3">
                Choose a bill to help with
              </h2>
              <div className="space-y-3">
                {invite.debts.map((debt) => (
                  <button
                    key={debt.id}
                    type="button"
                    onClick={() => setSelectedDebt(debt)}
                    className="card w-full text-left hover:border-teal-500/60 transition-colors cursor-pointer"
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-white font-semibold">
                          {debt.creditorName ?? 'Bill (private)'}
                        </p>
                        {debt.remainingAmountPence != null && (
                          <p className="text-mid-gray text-sm mt-1">
                            {formatPence(debt.remainingAmountPence)} outstanding
                          </p>
                        )}
                      </div>
                      <span className="text-teal-400 text-sm font-medium">Select →</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* No debts available */}
          {invite.debts.length === 0 && (
            <div className="card text-center py-8">
              <p className="text-white font-semibold mb-2">No bills available</p>
              <p className="text-mid-gray text-sm">
                There are currently no bills to help with. The recipient may need to link their debts first.
              </p>
            </div>
          )}

          {/* Single debt summary (auto-selected) */}
          {selectedDebt && (
            <>
              {/* Back button when multiple debts */}
              {invite.debts.length > 1 && (
                <button
                  type="button"
                  className="text-mid-gray text-sm mb-4 flex items-center gap-1 hover:text-white"
                  onClick={() => setSelectedDebt(null)}
                >
                  ← Choose a different bill
                </button>
              )}

              {/* Debt summary */}
              <div className="card mb-6">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm text-mid-gray mb-1">Paying to</p>
                    <p className="text-white font-semibold">
                      {selectedDebt.creditorName ?? 'Creditor (private)'}
                    </p>
                  </div>
                  {selectedDebt.remainingAmountPence != null && (
                    <div className="text-right">
                      <p className="text-sm text-mid-gray mb-1">Outstanding</p>
                      <p className="text-white font-bold">
                        {formatPence(selectedDebt.remainingAmountPence)}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Payment flow */}
              <PayContributorFlow
                inviteToken={token}
                invite={invite}
                selectedDebt={selectedDebt}
              />
            </>
          )}

          {/* Trust signals */}
          <div className="mt-8 flex flex-col gap-2">
            {[
              '🔒 Your bank details are never stored by Bolster',
              '⚡ Payment settles in ~90 seconds via Faster Payments',
              '✅ Money goes directly to the creditor — not to the recipient',
            ].map((line) => (
              <p key={line} className="text-xs text-mid-gray flex items-start gap-2">
                {line}
              </p>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
