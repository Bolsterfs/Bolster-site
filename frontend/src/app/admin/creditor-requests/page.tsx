'use client'

import { useCallback, useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import Link from 'next/link'
import { adminApi } from '../../../lib/api'
import type { CreditorRequest, NewCreditorInput } from '../../../lib/api'
import { useRequireAuth } from '../../../lib/useRequireAuth'

/**
 * Admin — creditor request queue.
 *
 * Recipients ask for creditors that aren't on the vetted list. Staff add them
 * here (recording who verified the bank details and how — this is the control
 * that stops made-up payee details reaching the list) or decline with a reason.
 * The recipient is emailed either way.
 */

type Filter = 'open' | 'resolved'

export default function CreditorRequestsAdminPage() {
  const { isChecking } = useRequireAuth()
  const [allowed,  setAllowed]  = useState<boolean | null>(null)
  const [filter,   setFilter]   = useState<Filter>('open')
  const [requests, setRequests] = useState<CreditorRequest[]>([])
  const [loading,  setLoading]  = useState(true)
  const [flash,    setFlash]    = useState<string | null>(null)

  const load = useCallback(async (f: Filter) => {
    setLoading(true)
    const r = await adminApi.creditorRequests(f)
    if (r.ok) setRequests(r.data)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (isChecking) return
    void adminApi.me().then((r) => {
      setAllowed(r.ok)
      if (r.ok) void load(filter)
      else setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChecking])

  useEffect(() => {
    if (allowed) void load(filter)
  }, [filter, allowed, load])

  if (isChecking || allowed === null) {
    return <Shell><p className="text-mid-gray animate-pulse">Loading…</p></Shell>
  }

  if (!allowed) {
    return (
      <Shell>
        <div className="card text-center">
          <h1 className="text-white font-semibold mb-2">Not available</h1>
          <p className="text-mid-gray text-sm mb-4">
            This page is for Bolster staff. If you should have access, your email needs to be
            in <code className="font-mono">ADMIN_EMAILS</code> in the backend settings.
          </p>
          <Link href="/dashboard" className="btn-secondary text-sm py-2 inline-block">← Dashboard</Link>
        </div>
      </Shell>
    )
  }

  const openCount = filter === 'open' ? requests.length : null

  return (
    <Shell>
      <div className="flex items-baseline justify-between mb-1">
        <h1 className="text-xl font-bold text-white">Creditor requests</h1>
        <Link href="/dashboard" className="text-mid-gray text-sm hover:text-white">← Dashboard</Link>
      </div>
      <p className="text-mid-gray text-sm mb-5">
        People asking for a creditor that isn&apos;t on the list yet. Adding one puts it on the
        list for everyone, so the bank details must be verified independently first.
      </p>

      {flash && (
        <div className="mb-4 rounded-lg border border-teal-500/40 bg-teal-500/10 px-4 py-3 text-sm text-teal-200">
          {flash}
        </div>
      )}

      <div className="flex border-b border-blue-900/40 mb-5">
        {(['open', 'resolved'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`flex-1 py-3 text-sm font-medium capitalize transition-colors ${
              filter === f ? 'text-teal-400 border-b-2 border-teal-400' : 'text-mid-gray hover:text-white'
            }`}
          >
            {f}{f === 'open' && openCount !== null && openCount > 0 ? ` (${openCount})` : ''}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-mid-gray animate-pulse">Loading…</p>
      ) : requests.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">{filter === 'open' ? '✅' : '📭'}</div>
          <h2 className="text-white font-semibold mb-1">
            {filter === 'open' ? 'Nothing waiting' : 'Nothing resolved yet'}
          </h2>
          <p className="text-mid-gray text-sm">
            {filter === 'open'
              ? 'New requests appear here as soon as someone asks for a creditor.'
              : 'Added and declined requests will be listed here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <RequestCard
              key={r.id}
              request={r}
              onResolved={(msg) => {
                setFlash(msg)
                void load(filter)
              }}
            />
          ))}
        </div>
      )}
    </Shell>
  )
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-navy">
      <header className="px-4 py-4 border-b border-blue-900/40">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <span className="text-white font-bold text-xl tracking-wide">BOLSTER</span>
          <span className="text-xs font-semibold uppercase tracking-wide text-orange-300">Admin</span>
        </div>
      </header>
      <div className="max-w-2xl mx-auto px-4 py-6">{children}</div>
    </div>
  )
}

// ── One request ───────────────────────────────────────────────────────────────

function RequestCard({
  request,
  onResolved,
}: {
  request:    CreditorRequest
  onResolved: (message: string) => void
}) {
  const [mode, setMode] = useState<'view' | 'add' | 'decline'>('view')
  const date = new Date(request.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="card">
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-white text-lg">{request.creditorName}</p>
          <p className="text-xs text-mid-gray mt-0.5">
            Asked by {request.requesterName} · <a className="underline hover:text-white" href={`mailto:${request.requesterEmail}`}>{request.requesterEmail}</a> · {date}
          </p>
          {request.othersAskingCount > 0 && (
            <p className="text-xs text-orange-300 mt-1">
              +{request.othersAskingCount} other{request.othersAskingCount === 1 ? '' : 's'} asking for the same creditor
            </p>
          )}
        </div>
        <StatusPill status={request.status} />
      </div>

      {request.note && (
        <p className="text-sm text-gray-300 mt-3 border-l-2 border-blue-900/60 pl-3 whitespace-pre-wrap">
          {request.note}
        </p>
      )}

      {request.status === 'open' && mode === 'view' && (
        <div className="flex gap-2 mt-4">
          <button type="button" className="btn-primary text-sm py-2 flex-1" onClick={() => setMode('add')}>
            Add to creditor list
          </button>
          <button type="button" className="btn-secondary text-sm py-2 px-4" onClick={() => setMode('decline')}>
            Decline
          </button>
        </div>
      )}

      {mode === 'add' && (
        <AddCreditorForm
          request={request}
          onCancel={() => setMode('view')}
          onDone={onResolved}
        />
      )}

      {mode === 'decline' && (
        <DeclineForm
          request={request}
          onCancel={() => setMode('view')}
          onDone={onResolved}
        />
      )}
    </div>
  )
}

function StatusPill({ status }: { status: CreditorRequest['status'] }) {
  const cls =
    status === 'open'     ? 'badge-pending' :
    status === 'added'    ? 'badge-settled' :
                            'badge-revoked'
  const label = status === 'open' ? 'waiting' : status
  return <span className={cls}>{label}</span>
}

// ── Add creditor ──────────────────────────────────────────────────────────────

const CATEGORIES: { value: NewCreditorInput['category']; label: string }[] = [
  { value: 'energy',   label: 'Energy' },
  { value: 'water',    label: 'Water' },
  { value: 'council',  label: 'Council' },
  { value: 'telecoms', label: 'Phone / broadband' },
  { value: 'lender',   label: 'Lender / credit card' },
  { value: 'bnpl',     label: 'Buy now, pay later' },
  { value: 'other',    label: 'Other' },
]

function AddCreditorForm({
  request,
  onCancel,
  onDone,
}: {
  request:  CreditorRequest
  onCancel: () => void
  onDone:   (message: string) => void
}) {
  const [name,          setName]          = useState(request.creditorName)
  const [category,      setCategory]      = useState<NewCreditorInput['category']>('other')
  const [aliases,       setAliases]       = useState('')
  const [sortCode,      setSortCode]      = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [referenceLabel, setReferenceLabel] = useState('Customer reference')
  const [referenceHint, setReferenceHint] = useState('')
  const [verifiedBy,    setVerifiedBy]    = useState('')
  const [verificationNote, setVerificationNote] = useState('')
  const [confirmed,     setConfirmed]     = useState(false)
  const [busy,          setBusy]          = useState(false)
  const [error,         setError]         = useState<string | null>(null)

  const sortDigits = sortCode.replace(/\D/g, '')
  const acctDigits = accountNumber.replace(/\D/g, '')
  const ready =
    name.trim().length >= 2 &&
    sortDigits.length === 6 &&
    acctDigits.length === 8 &&
    verifiedBy.trim().length >= 2 &&
    verificationNote.trim().length >= 5 &&
    confirmed

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    setError(null)
    const r = await adminApi.addCreditor(request.id, {
      name:             name.trim(),
      category,
      aliases:          aliases.split(',').map((a) => a.trim()).filter(Boolean),
      sortCode:         sortDigits,
      accountNumber:    acctDigits,
      referenceLabel:   referenceLabel.trim() || 'Customer reference',
      ...(referenceHint.trim() ? { referenceHint: referenceHint.trim() } : {}),
      verifiedBy:       verifiedBy.trim(),
      verificationNote: verificationNote.trim(),
    })
    setBusy(false)
    if (!r.ok) {
      setError(r.error)
      return
    }
    const extra = r.data.resolvedRequests > 1 ? ` and ${r.data.resolvedRequests - 1} other request${r.data.resolvedRequests > 2 ? 's' : ''} for it` : ''
    onDone(`${r.data.name} added to the creditor list. ${request.requesterName} has been emailed${extra}.`)
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="mt-4 pt-4 border-t border-blue-900/40 space-y-4">
      <p className="text-xs text-orange-200 bg-orange-500/10 border border-orange-500/30 rounded-lg px-3 py-2">
        Bank details entered here become the payee for every Bolster user. Check them against the
        creditor&apos;s own website or a bill — never against what the requester said.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="label" htmlFor={`name-${request.id}`}>Name shown to recipients</label>
          <input id={`name-${request.id}`} className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
        </div>
        <div>
          <label className="label" htmlFor={`cat-${request.id}`}>Category</label>
          <select id={`cat-${request.id}`} className="input" value={category} onChange={(e) => setCategory(e.target.value as NewCreditorInput['category'])}>
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`alias-${request.id}`}>Other names on bills <span className="text-mid-gray font-normal">(comma-separated)</span></label>
          <input id={`alias-${request.id}`} className="input" value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="e.g. BG, British Gas Trading" />
        </div>
        <div>
          <label className="label" htmlFor={`sc-${request.id}`}>Sort code</label>
          <input id={`sc-${request.id}`} className="input font-mono" inputMode="numeric" value={sortCode} onChange={(e) => setSortCode(e.target.value)} placeholder="12-34-56" />
          {sortCode && sortDigits.length !== 6 && <p className="error-text">6 digits</p>}
        </div>
        <div>
          <label className="label" htmlFor={`acct-${request.id}`}>Account number</label>
          <input id={`acct-${request.id}`} className="input font-mono" inputMode="numeric" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="12345678" />
          {accountNumber && acctDigits.length !== 8 && <p className="error-text">8 digits</p>}
        </div>
        <div>
          <label className="label" htmlFor={`rl-${request.id}`}>What they call the reference</label>
          <input id={`rl-${request.id}`} className="input" value={referenceLabel} onChange={(e) => setReferenceLabel(e.target.value)} placeholder="Customer reference" />
        </div>
        <div>
          <label className="label" htmlFor={`rh-${request.id}`}>Where to find it <span className="text-mid-gray font-normal">(optional)</span></label>
          <input id={`rh-${request.id}`} className="input" value={referenceHint} onChange={(e) => setReferenceHint(e.target.value)} placeholder="Top right of the bill" />
        </div>
        <div>
          <label className="label" htmlFor={`vb-${request.id}`}>Verified by</label>
          <input id={`vb-${request.id}`} className="input" value={verifiedBy} onChange={(e) => setVerifiedBy(e.target.value)} placeholder="Your name" />
        </div>
        <div>
          <label className="label" htmlFor={`vn-${request.id}`}>How it was verified</label>
          <input id={`vn-${request.id}`} className="input" value={verificationNote} onChange={(e) => setVerificationNote(e.target.value)} placeholder="Matched to 'how to pay' page on their website, 8 Nov" />
        </div>
      </div>

      <label className="flex items-start gap-3 text-sm text-gray-300 cursor-pointer">
        <input type="checkbox" className="mt-1" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        <span>I checked these bank details against an independent source, not the request.</span>
      </label>

      {error && <p className="error-text">{error}</p>}

      <div className="flex gap-2">
        <button type="submit" className="btn-primary text-sm py-2 flex-1" disabled={!ready || busy}>
          {busy ? 'Adding…' : 'Add creditor and notify requester'}
        </button>
        <button type="button" className="btn-secondary text-sm py-2 px-4" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  )
}

// ── Decline ───────────────────────────────────────────────────────────────────

function DeclineForm({
  request,
  onCancel,
  onDone,
}: {
  request:  CreditorRequest
  onCancel: () => void
  onDone:   (message: string) => void
}) {
  const [reason, setReason] = useState('')
  const [busy,   setBusy]   = useState(false)
  const [error,  setError]  = useState<string | null>(null)
  const ready = reason.trim().length >= 5

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    setError(null)
    const r = await adminApi.declineRequest(request.id, reason.trim())
    setBusy(false)
    if (!r.ok) {
      setError(r.error)
      return
    }
    onDone(`Request for ${request.creditorName} declined. ${request.requesterName} has been emailed the reason.`)
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="mt-4 pt-4 border-t border-blue-900/40 space-y-3">
      <div>
        <label className="label" htmlFor={`reason-${request.id}`}>Reason <span className="text-mid-gray font-normal">(sent to {request.requesterName})</span></label>
        <textarea
          id={`reason-${request.id}`}
          className="input"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          placeholder="e.g. This company only accepts payment by direct debit from the account holder, so we can't pay them on your behalf."
        />
      </div>
      {error && <p className="error-text">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" className="btn-primary text-sm py-2 flex-1" disabled={!ready || busy}>
          {busy ? 'Sending…' : 'Decline and notify requester'}
        </button>
        <button type="button" className="btn-secondary text-sm py-2 px-4" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  )
}
