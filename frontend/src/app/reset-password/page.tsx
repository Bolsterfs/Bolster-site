'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { auth } from '../../lib/api'
import { checkPassword } from '../../lib/passwordRules'
import AuthShell, {
  ErrorBanner, inputFocusHandlers, inputStyle, labelStyle, linkStyle, primaryButtonStyle,
} from '../../components/auth/AuthShell'

type Phase = 'checking' | 'form' | 'invalid' | 'done'

const ORANGE = '#f97316'

export default function ResetPasswordPage() {
  const [phase,    setPhase]    = useState<Phase>('checking')
  const [token,    setToken]    = useState('')
  const [password, setPassword] = useState('')
  const [show,     setShow]     = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)

  // The token is read from the address bar exactly once. A ref (not a local
  // variable) because React runs effects twice in development, and by the
  // second run the token has already been removed from the URL.
  const linkTokenRef = useRef<string | null>(null)

  // Read the token from the link, check it is still usable, then remove it
  // from the address bar so it doesn't linger in browser history.
  useEffect(() => {
    let cancelled = false

    async function checkLink() {
      if (linkTokenRef.current === null) {
        linkTokenRef.current = new URLSearchParams(window.location.search).get('token') ?? ''
        window.history.replaceState(null, '', window.location.pathname)
      }
      const linkToken = linkTokenRef.current

      if (!linkToken) {
        if (!cancelled) setPhase('invalid')
        return
      }

      const result = await auth.validateResetToken(linkToken)
      if (cancelled) return

      // If the check itself fails (e.g. offline) still show the form — the
      // server validates the link again when the new password is submitted.
      if (result.ok && !result.data.valid) {
        setPhase('invalid')
        return
      }
      setToken(linkToken)
      setPhase('form')
    }

    void checkLink()
    return () => { cancelled = true }
  }, [])

  const { rules, allRulesMet, filledBars, strengthLabel } = checkPassword(password)
  const canSubmit = !loading && allRulesMet

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!allRulesMet) return

    setLoading(true)
    setError(null)
    const result = await auth.resetPassword(token, password)
    setLoading(false)

    if (!result.ok) {
      if (result.code === 'RESET_LINK_INVALID') {
        setPhase('invalid')
        return
      }
      setError(/too many|rate limit/i.test(result.error)
        ? 'Too many attempts. Please wait a few minutes and try again.'
        : result.error)
      return
    }

    setPassword('')
    setPhase('done')
  }

  // ── Checking the link ─────────────────────────────────────────────────────
  if (phase === 'checking') {
    return (
      <AuthShell icon="🔑" title="Checking your link…">
        <p style={{ color: '#6B7280', fontSize: '15px', margin: 0, textAlign: 'center' }}>One moment.</p>
      </AuthShell>
    )
  }

  // ── Link expired, used or malformed ───────────────────────────────────────
  if (phase === 'invalid') {
    return (
      <AuthShell
        icon="⏳"
        title="This link has expired"
        subtitle="Reset links work once and last 30 minutes. If you asked for more than one, only the newest works."
        footer={<Link href="/login" style={linkStyle}>Back to sign in</Link>}
      >
        <Link href="/forgot-password" style={primaryButtonStyle(true)}>
          Send me a new link
        </Link>
      </AuthShell>
    )
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  if (phase === 'done') {
    return (
      <AuthShell
        icon="✅"
        title="Password updated"
        subtitle="You've been signed out everywhere else, so only your new password works from now on."
      >
        <Link href="/login" style={primaryButtonStyle(true)}>
          Sign in
        </Link>
      </AuthShell>
    )
  }

  // ── New password form ─────────────────────────────────────────────────────
  return (
    <AuthShell
      icon="🔑"
      title="Choose a new password"
      subtitle="Pick something you don't use anywhere else."
      footer={<Link href="/login" style={linkStyle}>Back to sign in</Link>}
    >
      <form onSubmit={handleSubmit} noValidate>
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
            <label htmlFor="new-password" style={{ ...labelStyle, marginBottom: 0 }}>New password</label>
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-pressed={show}
              style={{ ...linkStyle, background: 'none', border: 'none', padding: 0, fontSize: '13px', cursor: 'pointer' }}
            >
              {show ? 'Hide' : 'Show'}
            </button>
          </div>
          <input
            id="new-password"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            autoFocus
            style={inputStyle}
            {...inputFocusHandlers}
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(null) }}
            required
            minLength={12}
            disabled={loading}
            aria-describedby="password-strength password-rules"
          />

          {/* Strength bars */}
          <div id="password-strength" style={{ marginTop: '10px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  style={{
                    height: '6px',
                    borderRadius: '3px',
                    backgroundColor: i < filledBars ? ORANGE : '#E5E7EB',
                    transition: 'background-color 150ms ease',
                  }}
                />
              ))}
            </div>
            {strengthLabel && (
              <p style={{ fontSize: '12px', color: '#6B7280', marginTop: '6px', marginBottom: 0 }}>
                Strength: <span style={{ color: ORANGE, fontWeight: 600 }}>{strengthLabel}</span>
              </p>
            )}
          </div>

          {/* Rules checklist */}
          <ul id="password-rules" style={{ listStyle: 'none', padding: 0, margin: '10px 0 0 0' }}>
            {rules.map((rule) => {
              const untouched = password.length === 0
              const color = rule.met ? '#16A34A' : untouched ? '#9CA3AF' : '#DC2626'
              const icon  = rule.met ? '✓' : untouched ? '○' : '✕'
              return (
                <li key={rule.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color, padding: '2px 0' }}>
                  <span aria-hidden="true" style={{ fontWeight: 700, width: '12px', display: 'inline-block', textAlign: 'center' }}>{icon}</span>
                  <span>{rule.label}</span>
                </li>
              )
            })}
          </ul>
        </div>

        {error && <ErrorBanner>{error}</ErrorBanner>}

        <button type="submit" disabled={!canSubmit} style={primaryButtonStyle(canSubmit)}>
          {loading ? 'Updating password...' : 'Update password'}
        </button>
      </form>
    </AuthShell>
  )
}
