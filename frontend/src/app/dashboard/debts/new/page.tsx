'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { creditorApi, debtApi, formatPence } from '../../../../lib/api'
import type { BillScanResult, Creditor } from '../../../../lib/api'
import { prepareBillUpload, BillUploadError } from '../../../../lib/billUpload'
import { useRequireAuth } from '../../../../lib/useRequireAuth'

const CATEGORY_LABELS: Record<string, string> = {
  energy:   'Energy',
  water:    'Water',
  council:  'Council',
  telecoms: 'Phone & broadband',
  lender:   'Loan or card',
  bnpl:     'Buy now, pay later',
  other:    'Other',
}

/** How many matches to show before asking the person to keep typing. */
const MAX_RESULTS = 6

type ListState = 'loading' | 'ready' | 'error'
type RequestState = 'closed' | 'open' | 'sending' | 'sent'

/** What a bill scan told us, kept so the person can see what to check. */
interface ScanNote {
  kind:     'filled' | 'not-listed' | 'not-a-bill'
  message:  string
  warnings: string[]
}

function formatDueDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function NewDebtPage() {
  const router = useRouter()
  const { isChecking } = useRequireAuth()

  // The vetted creditor list
  const [creditors, setCreditors] = useState<Creditor[]>([])
  const [listState, setListState] = useState<ListState>('loading')
  const [reloadKey, setReloadKey] = useState(0)

  // The form
  const [search,       setSearch]       = useState('')
  const [selected,     setSelected]     = useState<Creditor | null>(null)
  const [reference,    setReference]    = useState('')
  const [amountPounds, setAmountPounds] = useState('')
  const [fieldErrors,  setFieldErrors]  = useState<{ reference?: string; amountPounds?: string }>({})
  const [apiError,     setApiError]     = useState<string | null>(null)
  const [loading,      setLoading]      = useState(false)

  // Bill scanning
  const [scanEnabled, setScanEnabled] = useState(false)
  const [scanning,    setScanning]    = useState(false)
  const [scanError,   setScanError]   = useState<string | null>(null)
  const [scanNote,    setScanNote]    = useState<ScanNote | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // "My creditor isn't listed"
  const [requestState, setRequestState] = useState<RequestState>('closed')
  const [requestName,  setRequestName]  = useState('')
  const [requestNote,  setRequestNote]  = useState('')
  const [requestError, setRequestError] = useState<string | null>(null)

  useEffect(() => {
    if (isChecking) return
    let cancelled = false
    void creditorApi.list().then((result) => {
      if (cancelled) return
      if (result.ok) {
        setCreditors(result.data)
        setListState('ready')
      } else {
        setListState('error')
      }
    })
    return () => { cancelled = true }
  }, [isChecking, reloadKey])

  // Is bill scanning switched on? (Off simply hides the option.)
  useEffect(() => {
    if (isChecking) return
    let cancelled = false
    void debtApi.scanStatus().then((result) => {
      if (!cancelled && result.ok) setScanEnabled(result.data.enabled)
    })
    return () => { cancelled = true }
  }, [isChecking])

  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return creditors
    return creditors.filter((c) =>
      c.name.toLowerCase().includes(needle) ||
      (CATEGORY_LABELS[c.category] ?? '').toLowerCase().includes(needle),
    )
  }, [creditors, search])

  if (isChecking) {
    return (
      <div className="min-h-screen bg-navy flex items-center justify-center">
        <div className="text-mid-gray animate-pulse">Loading…</div>
      </div>
    )
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  function chooseCreditor(creditor: Creditor) {
    setSelected(creditor)
    setApiError(null)
    setFieldErrors({})
    setRequestState('closed')
  }

  function changeCreditor() {
    setSelected(null)
    setReference('')
    setApiError(null)
    setFieldErrors({})
    setScanNote(null)
  }

  // ── Bill scan ─────────────────────────────────────────────────────────────

  function applyScan(result: BillScanResult) {
    if (!result.isBill) {
      setScanNote({
        kind: 'not-a-bill',
        message: 'That doesn\u2019t look like a bill or statement. You can try another photo, or choose who you owe from the list below.',
        warnings: [],
      })
      return
    }

    const listed = result.matchedCreditor
      ? creditors.find((c) => c.id === result.matchedCreditor?.id) ?? result.matchedCreditor
      : null

    if (!listed) {
      const name = result.creditorNameOnBill
      setSearch(name ?? '')
      setScanNote({
        kind: 'not-listed',
        message: name
          ? `Your bill is from ${name}, which isn\u2019t on our list yet. You can ask us to add them below.`
          : 'We couldn\u2019t tell who this bill is from. Please choose who you owe from the list below.',
        warnings: [],
      })
      return
    }

    // Pre-fill the form. Nothing is saved until the person checks and confirms.
    setSelected(listed)
    setReference(result.reference ?? '')
    setAmountPounds(result.amountPence !== null ? (result.amountPence / 100).toFixed(2) : '')
    setFieldErrors({})
    setApiError(null)
    setRequestState('closed')

    const read: string[] = [listed.name]
    if (result.amountPence !== null) read.push(formatPence(result.amountPence))
    if (result.reference) read.push(`reference ${result.reference}`)
    setScanNote({
      kind: 'filled',
      message: `We read ${read.join(', ')} from your bill${result.dueDate ? ` (due ${formatDueDate(result.dueDate)})` : ''}. Please check every detail against the bill before you add it.`,
      warnings: result.warnings,
    })
  }

  async function handleBillChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''   // allow choosing the same file again
    if (!file) return

    setScanning(true)
    setScanError(null)
    setScanNote(null)

    try {
      const upload = await prepareBillUpload(file)
      const result = await debtApi.scanBill(upload)
      if (result.ok) {
        applyScan(result.data)
      } else {
        setScanError(/too many|rate limit/i.test(result.error)
          ? 'You\u2019ve scanned several bills in a short time. Please wait a few minutes, or choose who you owe from the list.'
          : result.error)
      }
    } catch (err) {
      setScanError(err instanceof BillUploadError ? err.message : 'We couldn\u2019t read that file. Please try again.')
    } finally {
      setScanning(false)
    }
  }

  function handleAmountChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Allow digits and at most one decimal point, max 2 decimal places
    let val = e.target.value.replace(/[^\d.]/g, '')
    const parts = val.split('.')
    if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('')
    const newParts = val.split('.')
    if (newParts.length === 2 && (newParts[1]?.length ?? 0) > 2) {
      val = newParts[0] + '.' + (newParts[1] ?? '').slice(0, 2)
    }
    setAmountPounds(val)
    setFieldErrors((prev) => ({ ...prev, amountPounds: undefined }))
    setApiError(null)
  }

  function validate(): boolean {
    const errors: { reference?: string; amountPounds?: string } = {}
    const ref = reference.trim()

    if (!ref) {
      errors.reference = 'Please enter this so the creditor can match the payment to you'
    } else if (ref.length > 18) {
      errors.reference = 'This can be at most 18 characters'
    } else if (!/^[A-Za-z0-9 \-/.&]+$/.test(ref)) {
      errors.reference = 'Use only letters, numbers, spaces and - / . &'
    }

    const pounds = parseFloat(amountPounds)
    if (!amountPounds.trim()) {
      errors.amountPounds = 'Amount is required'
    } else if (isNaN(pounds) || pounds <= 0) {
      errors.amountPounds = 'Enter a valid amount greater than £0'
    } else if (Math.round(pounds * 100) < 100) {
      errors.amountPounds = 'Minimum amount is £1.00'
    }

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selected || !validate()) return

    setLoading(true)
    setApiError(null)

    const result = await debtApi.create({
      creditorId:       selected.id,
      creditorRef:      reference.trim(),
      totalAmountPence: Math.round(parseFloat(amountPounds) * 100),
    })

    setLoading(false)

    if (!result.ok) {
      setApiError(result.error)
      return
    }

    router.push('/dashboard')
  }

  function openRequest() {
    setRequestName(search.trim())
    setRequestNote('')
    setRequestError(null)
    setRequestState('open')
  }

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault()
    const name = requestName.trim()
    if (name.length < 2) {
      setRequestError('Please enter the creditor’s name')
      return
    }

    setRequestState('sending')
    setRequestError(null)

    const result = await creditorApi.request({
      creditorName: name,
      ...(requestNote.trim() ? { note: requestNote.trim() } : {}),
    })

    if (!result.ok) {
      setRequestState('open')
      setRequestError(result.error)
      return
    }
    setRequestState('sent')
  }

  const canSubmit = !loading && !!selected && !!reference.trim() && !!amountPounds.trim()
  const shown = matches.slice(0, MAX_RESULTS)

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-navy flex flex-col">
      {/* Header */}
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
            <h1 className="text-2xl font-bold text-white">Add a debt</h1>
            <p className="text-mid-gray text-sm mt-2">
              Choose who you owe and tell us your reference and the amount.
              You never need to enter bank details — we hold verified payment
              details for every creditor on our list.
            </p>
          </div>

          {/* Hidden file picker — on a phone this offers the camera or photo library */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => void handleBillChosen(e)}
            aria-hidden="true"
            tabIndex={-1}
          />

          {/* ── Step 1: choose the creditor ─────────────────────────────── */}
          {!selected && (
            <section aria-labelledby="choose-creditor">

              {scanEnabled && listState === 'ready' && (
                <div className="card mb-6">
                  <h2 className="text-white font-semibold">Have the bill to hand?</h2>
                  <p className="text-sm text-mid-gray mt-1">
                    Take a photo or upload it and we&apos;ll fill in the details for you to check.
                  </p>
                  <button
                    type="button"
                    className="btn-primary w-full mt-4 text-sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={scanning}
                  >
                    {scanning ? 'Reading your bill…' : '📷 Scan a bill'}
                  </button>
                  <p className="text-xs text-mid-gray mt-3 leading-relaxed">
                    Your bill is read by an AI service to fill in this form. We don&apos;t keep
                    the image, and nothing is saved until you&apos;ve checked it.
                  </p>
                  <div aria-live="polite">
                    {scanError && <p className="error-text mt-3" role="alert">{scanError}</p>}
                    {scanNote && (
                      <p className="text-sm text-yellow-300 mt-3">{scanNote.message}</p>
                    )}
                  </div>
                </div>
              )}

              {!scanEnabled && listState === 'ready' && process.env.NODE_ENV === 'development' && (
                <p className="text-xs text-mid-gray mb-6 rounded-lg border border-blue-900/40 px-3 py-2">
                  Dev note: bill scanning is off because no ANTHROPIC_API_KEY is set in backend/.env.
                </p>
              )}

              <label id="choose-creditor" htmlFor="creditor-search" className="label">
                Who do you owe?
              </label>
              <input
                id="creditor-search"
                type="search"
                className="input"
                placeholder="Start typing, e.g. British Gas"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setRequestState('closed') }}
                autoComplete="off"
                autoFocus
                disabled={listState !== 'ready'}
              />

              <div className="mt-3" aria-live="polite">
                {listState === 'loading' && (
                  <p className="text-sm text-mid-gray animate-pulse">Loading creditors…</p>
                )}

                {listState === 'error' && (
                  <div className="rounded-lg bg-red-950/60 border border-red-800/50 px-4 py-3">
                    <p className="text-sm text-red-300">We couldn&apos;t load the list of creditors.</p>
                    <button
                      type="button"
                      className="text-sm text-teal-400 hover:text-teal-300 font-medium mt-2"
                      onClick={() => { setListState('loading'); setReloadKey((k) => k + 1) }}
                    >
                      Try again
                    </button>
                  </div>
                )}

                {listState === 'ready' && shown.length > 0 && (
                  <ul className="space-y-2">
                    {shown.map((creditor) => (
                      <li key={creditor.id}>
                        <button
                          type="button"
                          onClick={() => chooseCreditor(creditor)}
                          className="w-full text-left rounded-lg border border-blue-900/60 bg-[#162046] px-4 py-3 hover:border-teal-500/70 transition-colors flex items-center justify-between gap-3"
                        >
                          <span>
                            <span className="block text-white font-medium">{creditor.name}</span>
                            <span className="block text-xs text-mid-gray mt-0.5">
                              {CATEGORY_LABELS[creditor.category] ?? 'Other'}
                              {creditor.isTestData && ' · test data'}
                            </span>
                          </span>
                          <span className="text-teal-400 text-sm font-medium flex-shrink-0">Choose →</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {listState === 'ready' && matches.length > MAX_RESULTS && (
                  <p className="text-xs text-mid-gray mt-3">
                    Showing {MAX_RESULTS} of {matches.length}. Keep typing to narrow it down.
                  </p>
                )}

                {listState === 'ready' && matches.length === 0 && (
                  <p className="text-sm text-mid-gray">
                    {creditors.length === 0
                      ? 'There are no creditors on our list yet.'
                      : <>We couldn&apos;t find &ldquo;{search.trim()}&rdquo; on our list.</>}
                  </p>
                )}
              </div>

              {/* ── Creditor not listed ───────────────────────────────── */}
              {listState === 'ready' && requestState === 'closed' && (
                <button
                  type="button"
                  className="text-sm text-teal-400 hover:text-teal-300 font-medium mt-5"
                  onClick={openRequest}
                >
                  Can&apos;t find who you owe? Ask us to add them
                </button>
              )}

              {(requestState === 'open' || requestState === 'sending') && (
                <form onSubmit={handleRequest} noValidate className="card mt-5 space-y-4">
                  <div>
                    <h2 className="text-white font-semibold">Ask us to add a creditor</h2>
                    <p className="text-sm text-mid-gray mt-1">
                      We check every creditor&apos;s payment details ourselves before
                      anyone can pay them, so this isn&apos;t instant. We&apos;ll email you
                      when they&apos;ve been added.
                    </p>
                  </div>
                  <div>
                    <label htmlFor="request-name" className="label">Creditor&apos;s name</label>
                    <input
                      id="request-name"
                      type="text"
                      className="input"
                      placeholder="As it appears on your bill"
                      value={requestName}
                      onChange={(e) => { setRequestName(e.target.value); setRequestError(null) }}
                      disabled={requestState === 'sending'}
                    />
                  </div>
                  <div>
                    <label htmlFor="request-note" className="label">
                      Anything that helps us find them{' '}
                      <span className="text-mid-gray font-normal">(optional)</span>
                    </label>
                    <input
                      id="request-note"
                      type="text"
                      className="input"
                      placeholder="e.g. their website"
                      value={requestNote}
                      onChange={(e) => setRequestNote(e.target.value)}
                      maxLength={500}
                      disabled={requestState === 'sending'}
                    />
                  </div>
                  {requestError && <p className="error-text" role="alert">{requestError}</p>}
                  <div className="flex gap-3">
                    <button
                      type="button"
                      className="btn-secondary flex-1 text-sm py-3"
                      onClick={() => setRequestState('closed')}
                      disabled={requestState === 'sending'}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="btn-primary flex-1 text-sm" disabled={requestState === 'sending'}>
                      {requestState === 'sending' ? 'Sending…' : 'Send request'}
                    </button>
                  </div>
                </form>
              )}

              {requestState === 'sent' && (
                <div className="card mt-5 border-teal-500/40" role="status">
                  <h2 className="text-white font-semibold">Request sent</h2>
                  <p className="text-sm text-mid-gray mt-1">
                    Thanks — we&apos;ll check {requestName.trim()}&apos;s payment details and
                    email you when you can add this debt. You don&apos;t need to do
                    anything else for now.
                  </p>
                  <Link href="/dashboard" className="inline-block text-sm text-teal-400 hover:text-teal-300 font-medium mt-3">
                    Back to dashboard
                  </Link>
                </div>
              )}
            </section>
          )}

          {/* ── Step 2: reference and amount ────────────────────────────── */}
          {selected && (
            <form onSubmit={handleSubmit} noValidate className="space-y-5">

              <div className="card flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-mid-gray">You owe</p>
                  <p className="text-white font-semibold">{selected.name}</p>
                  <p className="text-xs text-teal-400 mt-1">
                    ✓ Payment details verified by Bolster
                    {selected.isTestData && ' (test data)'}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-sm text-teal-400 hover:text-teal-300 font-medium flex-shrink-0"
                  onClick={changeCreditor}
                  disabled={loading}
                >
                  Change
                </button>
              </div>

              {scanNote?.kind === 'filled' && (
                <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3" role="status">
                  <p className="text-sm text-yellow-200">{scanNote.message}</p>
                  {scanNote.warnings.length > 0 && (
                    <ul className="list-disc pl-5 mt-2 space-y-1">
                      {scanNote.warnings.map((warning) => (
                        <li key={warning} className="text-sm text-yellow-200">{warning}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Reference */}
              <div>
                <label htmlFor="creditorRef" className="label">Your {selected.referenceLabel.toLowerCase()}</label>
                <input
                  id="creditorRef"
                  type="text"
                  className="input"
                  value={reference}
                  onChange={(e) => {
                    setReference(e.target.value)
                    setFieldErrors((prev) => ({ ...prev, reference: undefined }))
                    setApiError(null)
                  }}
                  maxLength={18}
                  autoComplete="off"
                  autoFocus
                  disabled={loading}
                />
                {fieldErrors.reference ? (
                  <p className="error-text">{fieldErrors.reference}</p>
                ) : (
                  <p className="text-xs text-mid-gray mt-1">
                    {selected.referenceHint ? `${selected.referenceHint}. ` : ''}
                    It goes on every payment so {selected.name} can match it to your account.
                  </p>
                )}
              </div>

              {/* Amount */}
              <div>
                <label htmlFor="amountPounds" className="label">Total amount owed</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-mid-gray font-medium select-none">
                    £
                  </span>
                  <input
                    id="amountPounds"
                    type="text"
                    inputMode="decimal"
                    className="input pl-8"
                    placeholder="0.00"
                    value={amountPounds}
                    onChange={handleAmountChange}
                    disabled={loading}
                  />
                </div>
                {fieldErrors.amountPounds ? (
                  <p className="error-text">{fieldErrors.amountPounds}</p>
                ) : (
                  <p className="text-xs text-mid-gray mt-1">
                    The full outstanding balance, in pounds
                  </p>
                )}
              </div>

              {/* API-level error */}
              {apiError && (
                <div className="rounded-lg bg-red-950/60 border border-red-800/50 px-4 py-3" role="alert">
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
                  {loading ? 'Adding…' : 'Add debt'}
                </button>
              </div>
            </form>
          )}

          {/* What happens next */}
          <div className="card mt-8">
            <h2 className="text-sm font-semibold text-white mb-3">What happens next?</h2>
            <ol className="space-y-3 text-sm text-mid-gray">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-900/60 text-blue-400 text-xs flex items-center justify-center font-semibold">1</span>
                <span>Your debt is ready straight away — the creditor&apos;s payment details come from our verified list</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-900/60 text-blue-400 text-xs flex items-center justify-center font-semibold">2</span>
                <span>Create a private invite link to share with the people you trust</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-900/60 text-blue-400 text-xs flex items-center justify-center font-semibold">3</span>
                <span>Supporters pay the creditor directly — money never passes through your account</span>
              </li>
            </ol>
          </div>

        </div>
      </main>
    </div>
  )
}
