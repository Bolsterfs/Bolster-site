'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { auth, setAccessToken, setRefreshToken } from '../../lib/api'

interface FormState {
  firstName: string
  lastName:  string
  email:     string
  password:  string
  phone:     string
}

const EMPTY: FormState = {
  firstName: '',
  lastName:  '',
  email:     '',
  password:  '',
  phone:     '',
}

export default function RegisterPage() {
  const router = useRouter()
  const [form,    setForm]    = useState<FormState>(EMPTY)
  const [error,   setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function update(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }))
      setError(null)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const result = await auth.register({
      firstName: form.firstName.trim(),
      lastName:  form.lastName.trim(),
      email:     form.email.trim(),
      password:  form.password,
      ...(form.phone.trim() && { phone: form.phone.trim() }),
    })

    setLoading(false)

    if (!result.ok) {
      setError(typeof result.error === 'string' ? result.error : JSON.stringify(result.error))
      return
    }

    setAccessToken(result.data.accessToken)
    setRefreshToken(result.data.refreshToken)
    router.push('/kyc')
  }

  const canSubmit = !loading && form.firstName && form.lastName && form.email && form.password

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#FAFAF8', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{ padding: '20px 16px' }}>
        <div style={{ maxWidth: '480px', margin: '0 auto' }}>
          <span style={{ color: '#6B21A8', fontWeight: 800, fontSize: '20px', letterSpacing: '0.05em' }}>BOLSTER</span>
        </div>
      </header>

      <main style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '16px 16px 64px' }}>
        <div style={{ width: '100%', maxWidth: '440px' }}>

          {/* Icon + headline */}
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{ backgroundColor: '#F3E8FF', borderRadius: '50%', width: '80px', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: '40px' }}>💜</div>
            <h1 style={{ fontSize: '32px', fontWeight: 800, color: '#1A0533', lineHeight: 1.2 }}>
              You don&apos;t have to carry<br />this alone.
            </h1>
            <p style={{ color: '#6B7280', marginTop: '12px', fontSize: '16px', lineHeight: 1.6, maxWidth: '320px', marginLeft: 'auto', marginRight: 'auto' }}>
              Let the people who love you help — safely, privately, and on your terms.
            </p>
          </div>

          {/* Form card */}
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: '20px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '28px' }}>
            <form onSubmit={handleSubmit} noValidate>
              {/* Name row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <label htmlFor="firstName" style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>First name</label>
                  <input
                    id="firstName"
                    type="text"
                    autoComplete="given-name"
                    style={{ width: '100%', backgroundColor: '#FFFFFF', border: '1.5px solid #E2D9F3', borderRadius: '12px', padding: '12px 16px', fontSize: '15px', color: '#1A0533', outline: 'none', boxSizing: 'border-box' }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = '#6B21A8'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(107,33,168,0.12)' }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = '#E2D9F3'; e.currentTarget.style.boxShadow = 'none' }}
                    value={form.firstName}
                    onChange={update('firstName')}
                    required
                    disabled={loading}
                  />
                </div>
                <div>
                  <label htmlFor="lastName" style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Last name</label>
                  <input
                    id="lastName"
                    type="text"
                    autoComplete="family-name"
                    style={{ width: '100%', backgroundColor: '#FFFFFF', border: '1.5px solid #E2D9F3', borderRadius: '12px', padding: '12px 16px', fontSize: '15px', color: '#1A0533', outline: 'none', boxSizing: 'border-box' }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = '#6B21A8'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(107,33,168,0.12)' }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = '#E2D9F3'; e.currentTarget.style.boxShadow = 'none' }}
                    value={form.lastName}
                    onChange={update('lastName')}
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label htmlFor="email" style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Email address</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  style={{ width: '100%', backgroundColor: '#FFFFFF', border: '1.5px solid #E2D9F3', borderRadius: '12px', padding: '12px 16px', fontSize: '15px', color: '#1A0533', outline: 'none', boxSizing: 'border-box' }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#6B21A8'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(107,33,168,0.12)' }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = '#E2D9F3'; e.currentTarget.style.boxShadow = 'none' }}
                  value={form.email}
                  onChange={update('email')}
                  required
                  disabled={loading}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label htmlFor="password" style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Password</label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  style={{ width: '100%', backgroundColor: '#FFFFFF', border: '1.5px solid #E2D9F3', borderRadius: '12px', padding: '12px 16px', fontSize: '15px', color: '#1A0533', outline: 'none', boxSizing: 'border-box' }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#6B21A8'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(107,33,168,0.12)' }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = '#E2D9F3'; e.currentTarget.style.boxShadow = 'none' }}
                  value={form.password}
                  onChange={update('password')}
                  required
                  minLength={12}
                  disabled={loading}
                />
                <p style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '4px' }}>Minimum 12 characters</p>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label htmlFor="phone" style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                  Mobile number <span style={{ color: '#9CA3AF', fontWeight: 400 }}>(optional)</span>
                </label>
                <input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="+44..."
                  style={{ width: '100%', backgroundColor: '#FFFFFF', border: '1.5px solid #E2D9F3', borderRadius: '12px', padding: '12px 16px', fontSize: '15px', color: '#1A0533', outline: 'none', boxSizing: 'border-box' }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#6B21A8'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(107,33,168,0.12)' }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = '#E2D9F3'; e.currentTarget.style.boxShadow = 'none' }}
                  value={form.phone}
                  onChange={update('phone')}
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
                  backgroundColor: canSubmit ? '#6B21A8' : '#6B21A8',
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
                {loading ? 'Creating account...' : 'Get started'}
              </button>
            </form>
          </div>

          <p style={{ textAlign: 'center', color: '#9CA3AF', fontSize: '12px', marginTop: '16px', letterSpacing: '0.05em' }}>
            Private. Dignified. No public appeals.
          </p>

          <p style={{ textAlign: 'center', color: '#6B7280', fontSize: '14px', marginTop: '24px' }}>
            Already have an account?{' '}
            <Link href="/login" style={{ color: '#6B21A8', fontWeight: 600, textDecoration: 'none' }}>
              Sign in
            </Link>
          </p>

          <p style={{ textAlign: 'center', fontSize: '12px', color: '#9CA3AF', marginTop: '32px', lineHeight: 1.6 }}>
            By creating an account you agree to our Terms of Service.
            Your identity will be verified before you can use the platform.
          </p>
        </div>
      </main>
    </div>
  )
}
