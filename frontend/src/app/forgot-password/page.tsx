'use client'

import { useState } from 'react'
import Link from 'next/link'
import { auth } from '../../lib/api'
import AuthShell, {
  ErrorBanner, inputFocusHandlers, inputStyle, labelStyle, linkStyle, primaryButtonStyle,
} from '../../components/auth/AuthShell'

/** Turn a failed request into something a person can act on. */
function friendlyError(error: string): string {
  if (/too many|rate limit/i.test(error)) {
    return 'You have asked for several reset links in a short time. Please wait a few minutes and try again.'
  }
  if (/network|failed to fetch/i.test(error)) {
    return 'We could not reach Bolster. Check your connection and try again.'
  }
  return error
}

export default function ForgotPasswordPage() {
  const [email,   setEmail]   = useState('')
  const [error,   setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sentTo,  setSentTo]  = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const address = email.trim()
    if (!address || !address.includes('@')) {
      setError('Please enter a valid email address')
      return
    }

    setLoading(true)
    setError(null)
    const result = await auth.forgotPassword(address)
    setLoading(false)

    if (!result.ok) {
      setError(friendlyError(result.error))
      return
    }
    setSentTo(address)
  }

  const backToSignIn = (
    <>Remembered it?{' '}<Link href="/login" style={linkStyle}>Back to sign in</Link></>
  )

  // ── Confirmation ──────────────────────────────────────────────────────────
  // Same message whether or not the email has an account — we never reveal
  // who is registered.
  if (sentTo) {
    return (
      <AuthShell
        icon="📬"
        title="Check your email"
        subtitle={<>If there&apos;s a Bolster account for <strong style={{ color: '#1A0533' }}>{sentTo}</strong>, a reset link is on its way.</>}
        footer={backToSignIn}
      >
        <ul style={{ margin: 0, paddingLeft: '20px', listStyle: 'disc', color: '#374151', fontSize: '15px', lineHeight: 1.7 }}>
          <li>The link works once and expires in 30 minutes.</li>
          <li>It can take a couple of minutes to arrive — check your spam folder too.</li>
          <li>Only the most recent link works if you ask more than once.</li>
        </ul>

        <button
          type="button"
          onClick={() => { setSentTo(null); setError(null) }}
          style={{ ...linkStyle, background: 'none', border: 'none', padding: 0, marginTop: '20px', fontSize: '14px', cursor: 'pointer' }}
        >
          Didn&apos;t get it? Try a different email address
        </button>
      </AuthShell>
    )
  }

  // ── Request form ──────────────────────────────────────────────────────────
  const canSubmit = !loading && email.trim().length > 0

  return (
    <AuthShell
      icon="🔑"
      title="Forgot your password?"
      subtitle="Enter the email you signed up with and we'll send you a link to choose a new one."
      footer={backToSignIn}
    >
      <form onSubmit={handleSubmit} noValidate>
        <div style={{ marginBottom: '20px' }}>
          <label htmlFor="email" style={labelStyle}>Email address</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
            style={inputStyle}
            {...inputFocusHandlers}
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(null) }}
            required
            disabled={loading}
          />
        </div>

        {error && <ErrorBanner>{error}</ErrorBanner>}

        <button type="submit" disabled={!canSubmit} style={primaryButtonStyle(canSubmit)}>
          {loading ? 'Sending link...' : 'Send reset link'}
        </button>
      </form>
    </AuthShell>
  )
}
