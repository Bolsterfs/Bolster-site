'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { debtApi, inviteApi, paymentApi, formatPence, clearAllTokens } from '../../lib/api'
import type { Debt, Invite, PaymentStatus } from '../../lib/api'
import { useRequireAuth } from '../../lib/useRequireAuth'

export default function DashboardPage() {
  const router = useRouter()
  const { isChecking } = useRequireAuth()

  const [debts,    setDebts]    = useState<Debt[]>([])
  const [invites,  setInvites]  = useState<Invite[]>([])
  const [payments, setPayments] = useState<PaymentStatus[]>([])
  const [loading,  setLoading]  = useState(true)
  const [tab,      setTab]      = useState<'debts' | 'invites' | 'history'>('debts')

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
  const totalOwed     = debts.reduce((s, d) => s + d.totalAmountPence - d.paidAmountPence, 0)
  const totalPaid     = debts.reduce((s, d) => s + d.paidAmountPence, 0)
  const activeInvites = invites.filter((i) => i.status === 'active').length

  return (
    <div className="min-h-screen bg-navy">
      {/* Header */}
      <header className="px-4 py-4 border-b border-blue-900/40">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <span className="text-white font-bold text-xl tracking-wide">BOLSTER</span>
          <button
            type="button"
            className="text-mid-gray text-sm hover:text-white transition-colors"
            onClick={handleSignOut}
          >
            Sign out
          </button>
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
                        <span>Paid: {formatPence(debt.paidAmountPence)}</span>
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
                title="No invites created yet"
                description="Go to your Debts tab to create an invite for a specific bill."
              />
            ) : (
              invites.map((invite) => (
                <div key={invite.id} className="card">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-white font-medium text-sm">
                        Invite · {invite.privacyLevel.replace(/_/g, ' ')}
                      </p>
                      <p className="text-xs text-mid-gray mt-0.5">
                        Opened {invite.openCount} time{invite.openCount !== 1 ? 's' : ''} ·
                        Expires {new Date(invite.expiresAt).toLocaleDateString('en-GB')}
                      </p>
                    </div>
                    <StatusBadge status={invite.status} />
                  </div>

                  {invite.status === 'active' && (
                    <div className="flex gap-2 mt-3">
                      <button
                        type="button"
                        className="flex-1 btn-primary text-sm py-2"
                        onClick={() => {
                          const url = `${window.location.origin}/invite/${invite.token}`
                          void navigator.clipboard.writeText(url)
                          alert('Invite link copied!')
                        }}
                      >
                        Copy link
                      </button>
                      <button
                        type="button"
                        className="btn-secondary text-sm py-2 px-4"
                        onClick={async () => {
                          if (confirm('Revoke this invite? The link will stop working.')) {
                            await inviteApi.revoke(invite.id, 'Revoked by recipient')
                            setInvites((prev) => prev.filter((i) => i.id !== invite.id))
                          }
                        }}
                      >
                        Revoke
                      </button>
                    </div>
                  )}
                </div>
              ))
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
                description="Payments made through your invite links will appear here."
              />
            ) : (
              payments.map((payment, i) => (
                <div key={i} className="card flex justify-between items-center">
                  <div>
                    <p className="text-white font-medium">{formatPence(payment.netAmountPence)}</p>
                    <p className="text-xs text-mid-gray mt-0.5">
                      {payment.settledAt
                        ? new Date(payment.settledAt).toLocaleDateString('en-GB')
                        : new Date(payment.createdAt).toLocaleDateString('en-GB')}
                    </p>
                  </div>
                  <StatusBadge status={payment.status} />
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Helper components ─────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
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
      {status.replace(/_/g, ' ')}
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
  action?:     { label: string; href: string }
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
