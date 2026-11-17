'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import PayContributorFlow from '../../../components/payment/PayContributorFlow'
import { formatPence } from '../../../lib/api'
import type { ResolvedInvite, ResolvedInviteDebt, InviteUnavailableCode } from '../../../lib/api'

/**
 * The invite page is the first (often only) thing a helper sees of Bolster.
 * They arrived from a friend's message, have never heard of us, and are about
 * to be asked for a card number. So the order is: who is asking → what Bolster
 * is and why it's safe → the bill → the payment. Trust before the form.
 */

const MARKETING_URL = 'https://bolsterfs.co.uk'

interface Unavailable {
  code:                InviteUnavailableCode
  recipientFirstName?: string
}

export default function InvitePage() {
  // Mounted at both /invite/[token] and /i/[code]; either value is accepted by the API.
  const params = useParams<{ token?: string; code?: string }>()
  const token = params.token ?? params.code ?? ''

  const [invite,       setInvite]       = useState<ResolvedInvite | null>(null)
  const [unavailable,  setUnavailable]  = useState<Unavailable | null>(null)
  const [networkError, setNetworkError] = useState(false)
  const [selectedDebt, setSelectedDebt] = useState<ResolvedInviteDebt | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch(`/api/v1/invites/resolve/${token}`)
        const body = await response.json() as {
          success: boolean
          data?:   ResolvedInvite | { recipientFirstName?: string }
          code?:   InviteUnavailableCode
        }
        if (!response.ok || !body.success) {
          const name = body.data && 'recipientFirstName' in body.data ? body.data.recipientFirstName : undefined
          setUnavailable({ code: body.code ?? 'INVITE_INVALID', ...(name ? { recipientFirstName: name } : {}) })
          return
        }
        const data = body.data as ResolvedInvite
        setInvite(data)
        if (data.debts.length === 1) setSelectedDebt(data.debts[0] ?? null)
      } catch {
        setNetworkError(true)
      }
    }
    void load()
  }, [token])

  // ── Loading ──────────────────────────────────────────────────────────────
  if (!invite && !unavailable && !networkError) {
    return (
      <main className="min-h-screen bg-navy flex items-center justify-center">
        <p className="text-mid-gray animate-pulse">Loading…</p>
      </main>
    )
  }

  // ── Can't be used ────────────────────────────────────────────────────────
  if (unavailable || networkError) {
    return (
      <main className="min-h-screen bg-navy flex flex-col">
        <TopBar />
        <div className="flex-1 flex items-center justify-center px-4">
          <UnavailableCard unavailable={unavailable} networkError={networkError} />
        </div>
        <Footer />
      </main>
    )
  }

  if (!invite) return null

  const name = invite.recipientFirstName

  return (
    <main className="min-h-screen bg-navy flex flex-col">
      <TopBar />

      <div className="flex-1 flex flex-col items-center justify-start px-4 py-8">
        <div className="w-full max-w-md">

          {/* Who is asking */}
          <div className="mb-6 text-center">
            <div className="w-16 h-16 bg-teal-900/40 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">💙</span>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">
              {name} has asked for your help with a bill
            </h1>
            <p className="text-mid-gray text-sm leading-relaxed">
              You can pay some or all of it. The money goes straight to the company{' '}
              {name} owes — it never passes through {name}&apos;s account.
            </p>
          </div>

          {/* Personal message */}
          {invite.personalMessage && (
            <div className="card mb-6 border-l-4 border-l-teal-500">
              <p className="text-sm text-mid-gray mb-1">Message from {name}</p>
              <p className="text-white italic">&ldquo;{invite.personalMessage}&rdquo;</p>
            </div>
          )}

          {/* What Bolster is — before we ask for anything */}
          <HowItWorks recipientFirstName={name} paymentMethod={invite.paymentMethod} />

          {/* Debt selection — only shown when multiple debts and none selected yet */}
          {!selectedDebt && invite.debts.length > 1 && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-white mb-1">
                Which bill would you like to help with?
              </h2>
              <p className="text-sm text-mid-gray mb-3">{name} has {invite.debts.length} bills on Bolster.</p>
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
                        <p className="text-white font-semibold">{debt.label}</p>
                        <p className="text-mid-gray text-sm mt-1">
                          {formatPence(debt.remainingAmountPence)} still to pay
                        </p>
                      </div>
                      <span className="text-teal-400 text-sm font-medium">Choose →</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* No debts available */}
          {invite.debts.length === 0 && (
            <div className="card text-center py-8">
              <p className="text-white font-semibold mb-2">Nothing to pay right now</p>
              <p className="text-mid-gray text-sm">
                {name} hasn&apos;t got a bill ready for help yet. It&apos;s worth checking back,
                or letting them know you opened the link.
              </p>
            </div>
          )}

          {/* Selected bill + payment */}
          {selectedDebt && (
            <>
              {invite.debts.length > 1 && (
                <button
                  type="button"
                  className="text-mid-gray text-sm mb-4 flex items-center gap-1 hover:text-white"
                  onClick={() => setSelectedDebt(null)}
                >
                  ← Choose a different bill
                </button>
              )}

              <div className="card mb-6">
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <p className="text-sm text-mid-gray mb-1">Paying towards</p>
                    <p className="text-white font-semibold">{selectedDebt.label}</p>
                    {!selectedDebt.creditorName && (
                      <p className="text-xs text-mid-gray mt-1">
                        {name}{' '}has chosen to keep the company&apos;s name private.
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-mid-gray mb-1">Still to pay</p>
                    <p className="text-white font-bold">{formatPence(selectedDebt.remainingAmountPence)}</p>
                  </div>
                </div>
              </div>

              <PayContributorFlow
                inviteToken={token}
                invite={invite}
                selectedDebt={selectedDebt}
              />
            </>
          )}
        </div>
      </div>

      <Footer />
    </main>
  )
}

// ── Pieces ────────────────────────────────────────────────────────────────────

function TopBar() {
  return (
    <header className="px-4 py-4 border-b border-blue-900/40">
      <div className="max-w-md mx-auto flex items-center justify-between">
        <span className="text-white font-bold text-xl tracking-wide">BOLSTER</span>
        <a
          href={MARKETING_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-mid-gray text-xs hover:text-white transition-colors"
        >
          What is Bolster? ↗
        </a>
      </div>
    </header>
  )
}

function Footer() {
  return (
    <footer className="px-4 py-5 border-t border-blue-900/40">
      <div className="max-w-md mx-auto text-center text-[11px] text-mid-gray leading-relaxed">
        <p>
          Bolster is operated by Digital Strategy Solutions Ltd, registered in England and Wales
          (company no. 14975605).
        </p>
        <p className="mt-1">
          <a href={`${MARKETING_URL}/privacy.html`} target="_blank" rel="noopener noreferrer" className="underline hover:text-white">Privacy</a>
          {' · '}
          <a href="mailto:support@bolsterfs.co.uk" className="underline hover:text-white">support@bolsterfs.co.uk</a>
        </p>
      </div>
    </footer>
  )
}

function HowItWorks({
  recipientFirstName,
  paymentMethod,
}: {
  recipientFirstName: string
  paymentMethod:      'card' | 'bank_transfer' | undefined
}) {
  const byBank = paymentMethod === 'bank_transfer'
  const points = [
    {
      icon: '🏢',
      title: 'Paid to the company, not the person',
      body:  `Bolster pays the company ${recipientFirstName} owes, directly. ${recipientFirstName} never receives or handles the money.`,
    },
    {
      icon: '🔒',
      title: byBank ? 'Approved by your own bank' : 'Secure card checkout',
      body:  byBank
        ? 'You approve the payment in your own banking app. Bolster never sees or stores your bank login.'
        : 'Your card details go to a secure, independent checkout. Bolster never sees or stores them.',
    },
    {
      icon: '👀',
      title: 'See the fee before you pay',
      body:  'A small fee is added on top so the full amount you choose reaches the company. You’ll see the exact total before anything is charged.',
    },
    {
      icon: '📩',
      title: 'Receipt by email',
      body:  `You’ll get a confirmation as soon as the payment goes through. Your contact details are not shared with ${recipientFirstName}.`,
    },
  ]
  return (
    <section className="card mb-6" aria-labelledby="how-it-works">
      <h2 id="how-it-works" className="text-xs uppercase tracking-wide text-mid-gray mb-3">How this works</h2>
      <ul className="space-y-3">
        {points.map((p) => (
          <li key={p.title} className="flex gap-3">
            <span className="text-lg leading-6" aria-hidden="true">{p.icon}</span>
            <div>
              <p className="text-white text-sm font-medium">{p.title}</p>
              <p className="text-mid-gray text-xs leading-relaxed">{p.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function UnavailableCard({
  unavailable,
  networkError,
}: {
  unavailable:  Unavailable | null
  networkError: boolean
}) {
  const who = unavailable?.recipientFirstName ?? 'the person who sent it'
  const copy = (() => {
    if (networkError) {
      return {
        icon:  '📶',
        title: 'Couldn’t load this invite',
        body:  'That looks like a connection problem rather than anything wrong with the link. Please check your signal and try again.',
        retry: true,
      }
    }
    switch (unavailable?.code) {
      case 'INVITE_FULLY_PAID':
        return {
          icon:  '🎉',
          title: 'Good news — this bill is already paid',
          body:  `Other people have already covered it, so there's nothing left to pay. ${who === 'the person who sent it' ? 'The person who sent you this' : who} may still have other bills on Bolster — it's worth asking.`,
          retry: false,
        }
      case 'INVITE_EXPIRED':
        return {
          icon:  '⏳',
          title: 'This link has expired',
          body:  `Invite links only last a limited time. Ask ${who} to send you a fresh one from their Bolster dashboard — it takes a few seconds.`,
          retry: false,
        }
      case 'INVITE_REVOKED':
        return {
          icon:  '🚫',
          title: 'This link has been withdrawn',
          body:  `${who === 'the person who sent it' ? 'The person who sent it' : who} has cancelled this invite. If you think that's a mistake, check with them directly.`,
          retry: false,
        }
      default:
        return {
          icon:  '🔗',
          title: 'This link isn’t right',
          body:  'It may have been copied incompletely — invite links are long, and a missing character breaks them. Ask the person who sent it to share it again.',
          retry: false,
        }
    }
  })()

  return (
    <div className="card max-w-md w-full text-center py-10">
      <div className="text-4xl mb-4" aria-hidden="true">{copy.icon}</div>
      <h1 className="text-xl font-bold text-white mb-2">{copy.title}</h1>
      <p className="text-mid-gray text-sm leading-relaxed max-w-sm mx-auto">{copy.body}</p>
      {copy.retry && (
        <button type="button" className="btn-secondary mt-6 text-sm py-2" onClick={() => window.location.reload()}>
          Try again
        </button>
      )}
      <p className="text-xs text-mid-gray mt-6">
        No money has been taken.
      </p>
    </div>
  )
}
