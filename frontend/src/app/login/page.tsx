'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { auth, setAccessToken, setRefreshToken } from '../../lib/api'

export default function LoginPage() {
  const router = useRouter()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const result = await auth.login(email.trim(), password)
    setLoading(false)

    if (!result.ok) {
      setError(typeof result.error === 'string' ? result.error : JSON.stringify(result.error))
      return
    }

    setAccessToken(result.data.accessToken)
    setRefreshToken(result.data.refreshToken)

    if (result.data.user.kycStatus === 'approved') {
      router.push('/dashboard')
    } else {
      router.push('/kyc')
    }
  }

  const canSubmit = !loading && email && password

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#FAFAF8', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{ padding: '20px 16px' }}>
        <div style={{ maxWidth: '480px', margin: '0 auto' }}>
          <span style={{ color: '#6B21A8', fontWeight: 800, fontSize: '20px', letterSpacing: '0.05em' }}>BOLSTER</span>
        </div>
      </header>

      <main style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px 64px' }}>
        <div style={{ width: '100%', maxWidth: '440px' }}>

          {/* Icon + headline */}
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{ backgroundColor: '#F3E8FF', borderRadius: '50%', width: '80px', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: '40px' }}>💜</div>
            <h1 style={{ fontSize: '32px', fontWeight: 800, color: '#1A0533', lineHeight: 1.2 }}>
              Welcome back.<br />Your community is here.
            </h1>
            <p style={{ color: '#6B7280', marginTop: '12px', fontSize: '16px', lineHeight: 1.6 }}>
              Sign in to your Bolster account.
            </p>
          </div>

          {/* Form card */}
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: '20px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '28px' }}>
            <form onSubmit={handleSubmit} noValidate>
              <div style={{ marginBottom: '16px' }}>
                <label htmlFor="email" style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Email address</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  style={{ width: '100%', backgroundColor: '#FFFFFF', border: '1.5px solid #E2D9F3', borderRadius: '12px', padding: '12px 16px', fontSize: '15px', color: '#1A0533', outline: 'none', boxSizing: 'border-box' }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#6B21A8'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(107,33,168,0.12)' }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = '#E2D9F3'; e.currentTarget.style.boxShadow = 'none' }}
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(null) }}
                  required
                  disabled={loading}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label htmlFor="password" style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Password</label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  style={{ width: '100%', backgroundColor: '#FFFFFF', border: '1.5px solid #E2D9F3', borderRadius: '12px', padding: '12px 16px', fontSize: '15px', color: '#1A0533', outline: 'none', boxSizing: 'border-box' }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#6B21A8'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(107,33,168,0.12)' }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = '#E2D9F3'; e.currentTarget.style.boxShadow = 'none' }}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null) }}
                  required
                  disabled={loading}
                />
              </div>

              {error && (
                <div style={{ borderRadius: '12px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', padding: '12px 16px', marginBottom: '16px' }}>
                  <p style={{ color: '#DC2626', fontSize: '14px', margin: 0 }}>{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                style={{
                  width: '100%',
                  backgroundColor: '#6B21A8',
                  opacity: canSubmit ? 1 : 0.5,
                  color: 'white',
                  fontSize: '16px',
                  fontWeight: 700,
                  letterSpacing: '0.02em',
                  padding: '14px 24px',
                  borderRadius: '12px',
                  border: 'none',
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                }}
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </form>
          </div>

          <p style={{ textAlign: 'center', color: '#9CA3AF', fontSize: '12px', marginTop: '16px', letterSpacing: '0.05em' }}>
            Private. Dignified. No public appeals.
          </p>

          <p style={{ textAlign: 'center', color: '#6B7280', fontSize: '14px', marginTop: '24px' }}>
            No account yet?{' '}
            <Link href="/register" style={{ color: '#6B21A8', fontWeight: 600, textDecoration: 'none' }}>
              Create one
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}
