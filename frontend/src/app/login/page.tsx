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
      setError(result.error)
      return
    }

    setAccessToken(result.data.accessToken)
    setRefreshToken(result.data.refreshToken)

    // Route based on KYC status
    if (result.data.user.kycStatus === 'approved') {
      router.push('/dashboard')
    } else {
      router.push('/kyc')
    }
  }

  return (
    <div className="min-h-screen bg-navy flex flex-col">
      {/* Header */}
      <header className="px-4 py-5 border-b border-blue-900/40">
        <div className="max-w-lg mx-auto">
          <span className="text-white font-bold text-xl tracking-wide">BOLSTER</span>
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center px-4 pt-16 pb-16">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-white">Welcome back</h1>
            <p className="text-mid-gray mt-2 text-sm">Sign in to your Bolster account.</p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label htmlFor="email" className="label">Email address</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                className="input"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null) }}
                required
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="password" className="label">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                className="input"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null) }}
                required
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
              disabled={loading || !email || !password}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="text-center text-mid-gray text-sm mt-6">
            No account yet?{' '}
            <Link href="/register" className="text-blue-400 hover:text-blue-300">
              Create one
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}
