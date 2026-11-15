'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { debtApi, inviteApi, paymentApi, adminApi, formatPence, clearAllTokens } from '../../lib/api'
import type { Debt, Invite, PaymentHistoryItem } from '../../lib/api'
import { useRequireAuth } from '../../lib/useRequireAuth'

export default function DashboardPage() {
  const router = useRouter()
  const { isChecking } = useRequireAuth()

  const [debts,    setDebts]    = useState<Debt[]>([])
  const [invites,  setInvites]  = useState<Invite[]>([])
  const [payments, setPayments] = useState<PaymentHistoryItem[]>([])
  const [loading,  setLoading]  = useState(true)
  const [tab,      setTab]      = useState<'debts' | 'invites' | 'history'>('debts')
  const [isAdmin,  setIsAdmin]  = useState(false)

  useEffect(() => {
    if (isChecking) return
    async function loadAll() {
      const [d, i, p] = await Promise.all([
        debtApi.list(),
        inviteApi.list(),
        paymentApi.list(),
      ])
      if (d.ok) setDebts(d.data)
      if (i.ok) setInvites(i.data)
      if (p.ok) setPayments(p.data)
      setLoading(false)
      // Quiet check — almost everyone gets a 403 here and never sees the link
      void adminApi.me().then((r) => setIsAdmin(r.ok))
    }
    void loadAll()
  }, [isChecking])

  function handleSignOut() {
    clearAllTokens()
    router.replace('/login')
  }

  // ── Loading / auth check ──────────────────────────────────────────────────

  if (isChecking || loading) {
    return (
      <div className="min-h-screen bg-navy flex items-center justify-center">
        <div className="text-mid-gray animate-pulse">Loading your dashboard…</div>
      </div>
    )
  }

  // ── Stats bar ─────────────────────────────────────────────────────────────
  const totalOwed     = debts.reduce((s, d) => s + Math.max(0, d.totalAmountPence - d.paidAmountPence), 0)
  const totalPaid     = debts.reduce((s, d) => s + Math.min(d.paidAmountPence, d.totalAmountPence), 0)
  const activeInvites = invites.filter((i) => i.status === 'active').length

  return (
    <div className="min-h-screen bg-navy">
      {/* Header */}
      <header className="px-4 py-4 border-b border-blue-900/40">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <span className="text-white font-bold text-xl tracking-wide">BOLSTER</span>
          <div className="flex items-center gap-4">
            {isAdmin && (
              <Link
                href="/admin/creditor-requests"
                className="text-xs font-semibold uppercase tracking-wide text-orange-300 hover:text-orange-200 transition-colors"
              >
                Admin
              </Link>
            )}
            <button
              type="button"
              className="text-mid-gray text-sm hover:text-white transition-colors"
              onClick={handleSignOut}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6">
        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="card text-center py-4">
            <p className="text-2xl font-bold text-red-400">{formatPence(totalOwed)}</p>
            <p className="text-xs text-mid-gray mt-1">Outstanding</p>
          </div>
          <div className="card text-center py-4">
            <p className="text-2xl font-bold text-teal-400">{formatPence(totalPaid)}</p>
            <p className="text-xs text-mid-gray mt-1">Paid by supporters</p>
          </div>
          <div className="card text-center py-4">
            <p className="text-2xl font-bold text-white">{activeInvites}</p>
            <p className="text-xs text-mid-gray mt-1">Active invites</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-blue-900/40 mb-6">
          {(['debts', 'invites', 'history'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 py-3 text-sm font-medium capitalize transition-colors ${
                tab === t
                  ? 'text-teal-400 border-b-2 border-teal-400'
                  : 'text-mid-gray hover:text-white'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Debts tab */}
        {tab === 'debts' && (
          <div className="space-y-3">
            {debts.length === 0 ? (
              <EmptyState
                icon="🏦"
                title="No debts linked yet"
                description="Link a debt to start receiving community support."
                action={{ label: 'Link a debt', href: '/dashboard/debts/new' }}
              />
            ) : (
              <>
                <Link
                  href="/dashboard/invites/new"
                  className="text-sm py-3 block text-center w-full rounded-lg font-semibold transition-colors mb-2"
                  style={{ backgroundColor: '#f97316', color: 'white' }}
                >
                  Create invite link →
                </Link>

                {debts.map((debt) => (
                  <div key={debt.id} className="card">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-semibold text-white">{debt.creditorName}</p>
                        <p className="text-xs text-mid-gray mt-0.5">
                          {!debt.copVerified && (
                            <span className="text-yellow-400">⏳ Verifying account… </span>
                          )}
                          Added {new Date(debt.createdAt).toLocaleDateString('en-GB')}
                        </p>
                      </div>
                      <StatusBadge status={debt.status} />
                    </div>

                    {/* Progress bar */}
                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-mid-gray mb-1">
                        {/* Show paid capped at the total: a few legacy test rows were over-credited before the overpay cap existed */}
                        <span>Paid: {formatPence(Math.min(debt.paidAmountPence, debt.totalAmountPence))}</span>
                        <span>Total: {formatPence(debt.totalAmountPence)}</span>
                      </div>
                      <div className="h-1.5 bg-blue-900/60 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-teal-500 rounded-full transition-all"
                          style={{
                            width: `${Math.min(100, (debt.paidAmountPence / debt.totalAmountPence) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}

                <Link
                  href="/dashboard/debts/new"
                  className="btn-secondary text-sm py-2 block text-center w-full"
                >
                  + Link another debt
                </Link>
              </>
            )}
          </div>
        )}

        {/* Invites tab */}
        {tab === 'invites' && (
          <div className="space-y-3">
            {invites.length === 0 ? (
              <EmptyState
                icon="💌"
                title="No invites yet"
                description="An invite is a private link you share with someone who wants to help. They choose a bill and pay the company directly."
                action={debts.length > 0 ? { label: 'Create invite link', href: '/dashboard/invites/new' } : undefined}
              />
            ) : (
              <>
                <Link
                  href="/dashboard/invites/new"
                  className="text-sm py-3 block text-center w-full rounded-lg font-semibold transition-colors mb-2"
                  style={{ backgroundColor: '#f97316', color: 'white' }}
                >
                  Create invite link →
                </Link>
                <p className="text-xs text-mid-gray px-1">{describeInvites(invites)}</p>
                {invites.map((invite) => (
                  <InviteCard
                    key={invite.id}
                    invite={invite}
                    onRevoked={() =>
                      setInvites((prev) =>
                        prev.map((i) => (i.id === invite.id ? { ...i, status: 'revoked' } : i)),
                      )
                    }
                  />
                ))}
              </>
            )}
          </div>
        )}

        {/* History tab */}
        {tab === 'history' && (
          <div className="space-y-3">
            {payments.length === 0 ? (
              <EmptyState
                icon="📊"
                title="No payments yet"
                description="When someone pays towards one of your bills, it will show here with who helped and how much reached the creditor."
              />
            ) : (
              <>
                <p className="text-xs text-mid-gray px-1">
                  {describeHistory(payments)}
                </p>
                {payments.map((payment) => (
                  <PaymentHistoryCard key={payment.id} payment={payment} />
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Helper components ─────────────────────────────────────────────────────────

function describeInvites(invites: Invite[]): string {
  const active = invites.filter((i) => i.status === 'active').length
  const opened = invites.reduce((s, i) => s + i.openCount, 0)
  const parts = [`${invites.length} invite${invites.length === 1 ? '' : 's'}`]
  parts.push(active === 0 ? 'none active' : `${active} active`)
  if (opened > 0) parts.push(`opened ${opened} time${opened === 1 ? '' : 's'} in total`)
  return parts.join(' · ')
}

const INVITE_STATUS_COPY: Record<string, string> = {
  active:     'Active',
  fully_paid: 'Bill fully paid',
  expired:    'Expired',
  revoked:    'Revoked',
}

const PRIVACY_COPY: Record<string, string> = {
  amount_only:   'Company name hidden',
  creditor_name: 'Company name shown',
  full_balance:  'Company and full balance shown',
}

function InviteCard({ invite, onRevoked }: { invite: Invite; onRevoked: () => void }) {
  const [copied, setCopied] = useState(false)
  const isActive = invite.status === 'active'
  const created  = new Date(invite.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const expires  = new Date(invite.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  function copy() {
    void navigator.clipboard.writeText(`${window.location.origin}/invite/${invite.token}`).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className={`card ${isActive ? '' : 'opacity-75'}`}>
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0">
          <p className="text-white font-medium">
            {invite.creditorName ? `For ${invite.creditorName}` : 'Any of my bills'}
          </p>
          <p className="text-xs text-mid-gray mt-0.5">
            {PRIVACY_COPY[invite.privacyLevel] ?? invite.privacyLevel.replace(/_/g, ' ')}
            {invite.maxAmountPence ? ` · up to ${formatPence(invite.maxAmountPence)} per person` : ''}
          </p>
          <p className="text-xs text-mid-gray mt-0.5">
            Created {created} · {isActive ? `expires ${expires}` : `was due to expire ${expires}`} ·
            opened {invite.openCount} time{invite.openCount === 1 ? '' : 's'}
          </p>
        </div>
        <StatusBadge status={invite.status} label={INVITE_STATUS_COPY[invite.status]} />
      </div>

      {invite.personalMessage && (
        <p className="text-sm text-gray-300 mt-3 border-l-2 border-blue-900/60 pl-3 italic">
          &ldquo;{invite.personalMessage}&rdquo;
        </p>
      )}

      <div className="flex gap-2 mt-3">
        <button
          type="button"
          className={`${isActive ? 'btn-primary flex-1' : 'btn-secondary flex-1'} text-sm py-2`}
          onClick={copy}
        >
          {copied ? 'Link copied' : isActive ? 'Copy link' : 'Copy link (to see what helpers see)'}
        </button>
        {isActive && (
          <button
            type="button"
            className="btn-secondary text-sm py-2 px-4"
            onClick={async () => {
              if (confirm('Revoke this invite? The link will stop working for anyone who has it.')) {
                const r = await inviteApi.revoke(invite.id, 'Revoked by recipient')
                if (r.ok) onRevoked()
              }
            }}
          >
            Revoke
          </button>
        )}
      </div>
    </div>
  )
}

/** "3 payments · £150.00 reached your creditors" — one line of context above the list. */
function describeHistory(payments: PaymentHistoryItem[]): string {
  const settled = payments.filter((p) => p.status === 'settled')
  const reached = settled.reduce((s, p) => s + p.netAmountPence, 0)
  if (settled.length === 0) return `${payments.length} payment${payments.length === 1 ? '' : 's'} started — none completed yet`
  return `${settled.length} completed payment${settled.length === 1 ? '' : 's'} · ${formatPence(reached)} reached your creditors`
}

const PAYMENT_STATUS_COPY: Record<string, string> = {
  settled:   'Paid to creditor',
  pending:   'Waiting for confirmation',
  initiated: 'Started, not completed',
  failed:    'Payment failed — nothing was taken',
  expired:   'Checkout not completed',
  refunded:  'Refunded',
}

function PaymentHistoryCard({ payment }: { payment: PaymentHistoryItem }) {
  const when = payment.settledAt ?? payment.createdAt
  const date = new Date(when).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const isSettled = payment.status === 'settled'

  return (
    <div className="card">
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-white truncate">
            {payment.contributorName} <span className="font-normal text-mid-gray">→</span> {payment.creditorName}
          </p>
          <p className="text-xs text-mid-gray mt-0.5">
            {date} · {PAYMENT_STATUS_COPY[payment.status] ?? payment.status.replace(/_/g, ' ')}
          </p>
        </div>
        <p className={`text-lg font-bold whitespace-nowrap ${isSettled ? 'text-teal-400' : 'text-mid-gray'}`}>
          {formatPence(payment.netAmountPence)}
        </p>
      </div>

      {isSettled && (
        <div className="mt-3 pt-3 border-t border-blue-900/40 grid grid-cols-3 gap-2 text-xs">
          <div>
            <p className="text-mid-gray">To creditor</p>
            <p className="text-white font-medium">{formatPence(payment.netAmountPence)}</p>
          </div>
          <div>
            <p className="text-mid-gray">Bolster fee</p>
            <p className="text-white font-medium">{formatPence(payment.feeAmountPence)}</p>
          </div>
          <div>
            <p className="text-mid-gray">{payment.contributorName.split(' ')[0]} paid</p>
            <p className="text-white font-medium">{formatPence(payment.grossAmountPence)}</p>
          </div>
        </div>
      )}

      <p className="text-[11px] text-mid-gray mt-2 font-mono">Ref {payment.reference}</p>
    </div>
  )
}

function StatusBadge({ status, label }: { status: string; label?: string | undefined }) {
  const map: Record<string, string> = {
    active:     'badge-active',
    settled:    'badge-settled',
    fully_paid: 'badge-settled',
    resolved:   'badge-settled',
    pending:    'badge-pending',
    initiated:  'badge-pending',
    failed:     'badge-failed',
    revoked:    'badge-revoked',
    expired:    'badge-revoked',
  }
  return (
    <span className={map[status] ?? 'badge-active'}>
      {label ?? status.replace(/_/g, ' ')}
    </span>
  )
}

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon:        string
  title:       string
  description: string
  action?:     { label: string; href: string } | undefined
}) {
  return (
    <div className="text-center py-12">
      <div className="text-4xl mb-3">{icon}</div>
      <h3 className="text-white font-semibold mb-1">{title}</h3>
      <p className="text-mid-gray text-sm mb-4">{description}</p>
      {action && (
        <Link href={action.href} className="btn-primary inline-block px-6 py-2 text-sm">
          {action.label}
        </Link>
      )}
    </div>
  )
}
