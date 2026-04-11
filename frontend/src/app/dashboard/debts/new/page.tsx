'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { debtApi } from '../../../../lib/api'
import { useRequireAuth } from '../../../../lib/useRequireAuth'

interface FormState {
  creditorName:     string
  creditorSortCode: string
  creditorAccount:  string
  creditorRef:      string
  amountPounds:     string
}

interface FieldErrors {
  creditorName?:     string
  creditorSortCode?: string
  creditorAccount?:  string
  amountPounds?:     string
}

const EMPTY: FormState = {
  creditorName:     '',
  creditorSortCode: '',
  creditorAccount:  '',
  creditorRef:      '',
  amountPounds:     '',
}

export default function NewDebtPage() {
  const router = useRouter()
  const { isChecking } = useRequireAuth()
  const [form,        setForm]        = useState<FormState>(EMPTY)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [apiError,    setApiError]    = useState<string | null>(null)
  const [loading,     setLoading]     = useState(false)

  if (isChecking) {
    return (
      <div className="min-h-screen bg-navy flex items-center justify-center">
        <div className="text-mid-gray animate-pulse">Loading…</div>
      </div>
    )
  }

  // ── Field change helpers ──────────────────────────────────────────────────

  function updateText(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }))
      clearFieldError(field as keyof FieldErrors)
    }
  }

  function clearFieldError(field: keyof FieldErrors) {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: undefined }))
    }
    setApiError(null)
  }

  function handleSortCodeChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Strip everything except digits, cap at 6, auto-insert hyphens (XX-XX-XX)
    const digits = e.target.value.replace(/\D/g, '').slice(0, 6)
    let formatted = digits
    if (digits.length > 4) formatted = `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`
    else if (digits.length > 2) formatted = `${digits.slice(0, 2)}-${digits.slice(2)}`
    setForm((prev) => ({ ...prev, creditorSortCode: formatted }))
    clearFieldError('creditorSortCode')
  }

  function handleAccountChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 8)
    setForm((prev) => ({ ...prev, creditorAccount: digits }))
    clearFieldError('creditorAccount')
  }

  function handleAmountChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Allow digits and at most one decimal point, max 2 decimal places
    let val = e.target.value.replace(/[^\d.]/g, '')
    const parts = val.split('.')
    if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('')
    const newParts = val.split('.')
    if (newParts.length === 2 && newParts[1].length > 2) {
      val = newParts[0] + '.' + newParts[1].slice(0, 2)
    }
    setForm((prev) => ({ ...prev, amountPounds: val }))
    clearFieldError('amountPounds')
  }

  // ── Validation ────────────────────────────────────────────────────────────

  function validate(): boolean {
    const errors: FieldErrors = {}

    if (!form.creditorName.trim()) {
      errors.creditorName = 'Creditor name is required'
    }

    const sortDigits = form.creditorSortCode.replace(/\D/g, '')
    if (!sortDigits) {
      errors.creditorSortCode = 'Sort code is required'
    } else if (sortDigits.length !== 6) {
      errors.creditorSortCode = 'Sort code must be 6 digits'
    }

    const accountDigits = form.creditorAccount.replace(/\D/g, '')
    if (!accountDigits) {
      errors.creditorAccount = 'Account number is required'
    } else if (accountDigits.length !== 8) {
      errors.creditorAccount = 'Account number must be 8 digits'
    }

    if (!form.amountPounds.trim()) {
      errors.amountPounds = 'Amount is required'
    } else {
      const pounds = parseFloat(form.amountPounds)
      if (isNaN(pounds) || pounds <= 0) {
        errors.amountPounds = 'Enter a valid amount greater than £0'
      } else if (Math.round(pounds * 100) < 100) {
        errors.amountPounds = 'Minimum amount is £1.00'
      }
    }

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    setLoading(true)
    setApiError(null)

    const result = await debtApi.create({
      creditorName:     form.creditorName.trim(),
      creditorSortCode: form.creditorSortCode.replace(/\D/g, ''),
      creditorAccount:  form.creditorAccount,
      ...(form.creditorRef.trim() ? { creditorRef: form.creditorRef.trim() } : {}),
      totalAmountPence: Math.round(parseFloat(form.amountPounds) * 100),
    })

    setLoading(false)

    if (!result.ok) {
      setApiError(result.error)
      return
    }

    router.push('/dashboard')
  }

  const canSubmit =
    !loading &&
    !!form.creditorName.trim() &&
    form.creditorSortCode.replace(/\D/g, '').length === 6 &&
    form.creditorAccount.length === 8 &&
    !!form.amountPounds.trim()

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
            <h1 className="text-2xl font-bold text-white">Link a debt</h1>
            <p className="text-mid-gray text-sm mt-2">
              Enter the creditor&apos;s bank details. We&apos;ll run a
              Confirmation of Payee check before enabling payments.
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-5">

            {/* Creditor name */}
            <div>
              <label htmlFor="creditorName" className="label">Creditor name</label>
              <input
                id="creditorName"
                type="text"
                className="input"
                placeholder="e.g. Zilch, Barclaycard, Council Tax"
                value={form.creditorName}
                onChange={updateText('creditorName')}
                autoComplete="off"
                disabled={loading}
              />
              {fieldErrors.creditorName && (
                <p className="error-text">{fieldErrors.creditorName}</p>
              )}
            </div>

            {/* Sort code + account number */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="sortCode" className="label">Sort code</label>
                <input
                  id="sortCode"
                  type="text"
                  inputMode="numeric"
                  className="input"
                  placeholder="XX-XX-XX"
                  value={form.creditorSortCode}
                  onChange={handleSortCodeChange}
                  maxLength={8}
                  disabled={loading}
                />
                {fieldErrors.creditorSortCode && (
                  <p className="error-text">{fieldErrors.creditorSortCode}</p>
                )}
              </div>

              <div>
                <label htmlFor="accountNumber" className="label">Account number</label>
                <input
                  id="accountNumber"
                  type="text"
                  inputMode="numeric"
                  className="input"
                  placeholder="12345678"
                  value={form.creditorAccount}
                  onChange={handleAccountChange}
                  maxLength={8}
                  disabled={loading}
                />
                {fieldErrors.creditorAccount && (
                  <p className="error-text">{fieldErrors.creditorAccount}</p>
                )}
              </div>
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
                  value={form.amountPounds}
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

            {/* Reference — optional */}
            <div>
              <label htmlFor="creditorRef" className="label">
                Payment reference{' '}
                <span className="text-mid-gray font-normal">(optional)</span>
              </label>
              <input
                id="creditorRef"
                type="text"
                className="input"
                placeholder="Your account or customer number"
                value={form.creditorRef}
                onChange={updateText('creditorRef')}
                autoComplete="off"
                disabled={loading}
              />
              <p className="text-xs text-mid-gray mt-1">
                Included on every payment so the creditor can match it to your account
              </p>
            </div>

            {/* API-level error */}
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
                {loading ? 'Adding…' : 'Add debt'}
              </button>
            </div>
          </form>

          {/* What happens next */}
          <div className="card mt-8">
            <h2 className="text-sm font-semibold text-white mb-3">What happens next?</h2>
            <ol className="space-y-3 text-sm text-mid-gray">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-900/60 text-blue-400 text-xs flex items-center justify-center font-semibold">1</span>
                <span>We verify the account via Confirmation of Payee — usually instant</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-900/60 text-blue-400 text-xs flex items-center justify-center font-semibold">2</span>
                <span>Once verified, you can create private invite links to share with supporters</span>
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
