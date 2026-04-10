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
      setError(result.error)
      return
    }

    setAccessToken(result.data.accessToken)
    setRefreshToken(result.data.refreshToken)

    // KYC is required before using the platform — always redirect there after registration
    router.push('/kyc')
  }

  return (
    <div className="min-h-screen bg-navy flex flex-col">
      {/* Header */}
      <header className="px-4 py-5 border-b border-blue-900/40">
        <div className="max-w-lg mx-auto">
          <span className="text-white font-bold text-xl tracking-wide">BOLSTER</span>
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center px-4 pt-10 pb-16">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-white">Create your account</h1>
            <p className="text-mid-gray mt-2 text-sm">
              Let the people who love you help — safely and privately.
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {/* Name row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="firstName" className="label">First name</label>
                <input
                  id="firstName"
                  type="text"
                  autoComplete="given-name"
                  className="input"
                  value={form.firstName}
                  onChange={update('firstName')}
                  required
                  disabled={loading}
                />
              </div>
              <div>
                <label htmlFor="lastName" className="label">Last name</label>
                <input
                  id="lastName"
                  type="text"
                  autoComplete="family-name"
                  className="input"
                  value={form.lastName}
                  onChange={update('lastName')}
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="label">Email address</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                className="input"
                value={form.email}
                onChange={update('email')}
                required
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="password" className="label">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                className="input"
                value={form.password}
                onChange={update('password')}
                required
                minLength={12}
                disabled={loading}
              />
              <p className="text-xs text-mid-gray mt-1">Minimum 12 characters</p>
            </div>

            <div>
              <label htmlFor="phone" className="label">
                Mobile number <span className="text-mid-gray font-normal">(optional)</span>
              </label>
              <input
                id="phone"
                type="tel"
                autoComplete="tel"
                className="input"
                placeholder="+44..."
                value={form.phone}
                onChange={update('phone')}
                disabled={loading}
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-950/60 border border-red-800/50 px-4 py-3">
                <p className="error-text mt-0">{error}</p>
              </div>
            )}

            <button
              type="submit"
              className="btn-primary w-full mt-2"
              disabled={loading || !form.firstName || !form.lastName || !form.email || !form.password}
            >
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="text-center text-mid-gray text-sm mt-6">
            Already have an account?{' '}
            <Link href="/login" className="text-blue-400 hover:text-blue-300">
              Sign in
            </Link>
          </p>

          <p className="text-center text-xs text-mid-gray mt-8 leading-relaxed">
            By creating an account you agree to our Terms of Service.
            Your identity will be verified before you can use the platform.
          </p>
        </div>
      </main>
    </div>
  )
}
