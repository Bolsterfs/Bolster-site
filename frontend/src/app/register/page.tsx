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

const PASSWORD_RULES = [
  { id: 'length',    label: 'At least 12 characters',         test: (p: string) => p.length >= 12 },
  { id: 'uppercase', label: 'One uppercase letter (A-Z)',     test: (p: string) => /[A-Z]/.test(p) },
  { id: 'lowercase', label: 'One lowercase letter (a-z)',     test: (p: string) => /[a-z]/.test(p) },
  { id: 'number',    label: 'One number (0-9)',               test: (p: string) => /[0-9]/.test(p) },
  { id: 'special',   label: 'One special character (!@#$%^&*)', test: (p: string) => /[!@#$%^&*()\-_=+[\]{};:'",.<>/?\\|`~]/.test(p) },
] as const

const STRENGTH_LABELS = ['Weak', 'Fair', 'Good', 'Strong'] as const
const ORANGE = '#f97316'

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

  const ruleResults = PASSWORD_RULES.map((rule) => ({
    ...rule,
    met: rule.test(form.password),
  }))
  const metCount = ruleResults.filter((r) => r.met).length
  const allRulesMet = metCount === PASSWORD_RULES.length

  // Map 0-5 met rules → 0-4 filled bars (only all 5 = Strong)
  const filledBars =
    metCount === 0 ? 0 :
    metCount <= 2 ? 1 :
    metCount === 3 ? 2 :
    metCount === 4 ? 3 : 4
  const strengthLabel = filledBars === 0 ? '' : STRENGTH_LABELS[filledBars - 1]

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

  const canSubmit = !loading && form.firstName && form.lastName && form.email && allRulesMet

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
                  {ruleResults.map((rule) => {
                    const untouched = form.password.length === 0
                    const color = rule.met ? '#16A34A' : untouched ? '#9CA3AF' : '#DC2626'
                    const icon  = rule.met ? '✓' : untouched ? '○' : '✕'
                    return (
                      <li
                        key={rule.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          fontSize: '12px',
                          color,
                          padding: '2px 0',
                        }}
                      >
                        <span aria-hidden="true" style={{ fontWeight: 700, width: '12px', display: 'inline-block', textAlign: 'center' }}>{icon}</span>
                        <span>{rule.label}</span>
                      </li>
                    )
                  })}
                </ul>
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
