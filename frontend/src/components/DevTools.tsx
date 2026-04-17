'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  auth,
  devApi,
  setAccessToken,
  setRefreshToken,
  getAccessToken,
  decodeTokenPayload,
} from '../lib/api'

export default function DevTools() {
  const router = useRouter()
  const [open,       setOpen]       = useState(false)
  const [busy,       setBusy]       = useState<string | null>(null)
  const [inviteUrl,  setInviteUrl]  = useState<string | null>(null)
  const [copied,     setCopied]     = useState(false)
  const [msg,        setMsg]        = useState<string | null>(null)
  const [tokenInfo,  setTokenInfo]  = useState<{ email?: string; kycStatus?: string } | null>(null)

  // Refresh token info whenever the panel opens
  useEffect(() => {
    if (open) setTokenInfo(decodeTokenPayload())
  }, [open])

  async function handleAutoLogin() {
    setBusy('login')
    setMsg(null)
    const result = await auth.login('test6@bolster.io', 'TestPassword123!')
    setBusy(null)

    if (!result.ok) {
      setMsg(result.error)
      return
    }

    setAccessToken(result.data.accessToken)
    setRefreshToken(result.data.refreshToken)
    setTokenInfo({ email: result.data.user.email, kycStatus: result.data.user.kycStatus })
    setMsg('Logged in')

    if (result.data.user.kycStatus === 'approved') {
      router.push('/dashboard')
    } else {
      router.push('/kyc')
    }
  }

  async function handleApproveKyc() {
    if (!getAccessToken()) {
      setMsg('Login first')
      return
    }
    setBusy('kyc')
    setMsg(null)
    const result = await devApi.approveKyc()
    setBusy(null)

    if (!result.ok) {
      setMsg(result.error)
      return
    }

    setTokenInfo((prev) => prev ? { ...prev, kycStatus: 'approved' } : prev)
    setMsg('KYC approved')
  }

  async function handleSeed() {
    if (!getAccessToken()) {
      setMsg('Login first')
      return
    }
    setBusy('seed')
    setMsg(null)
    const result = await devApi.seed()
    setBusy(null)

    if (!result.ok) {
      setMsg(result.error)
      return
    }

    setInviteUrl(result.data.inviteUrl)
    setMsg('Seeded')
  }

  function handleCopyInvite() {
    if (!inviteUrl) return
    void navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {/* Floating toggle */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-3 py-2 rounded-full shadow-lg transition-colors"
        >
          Dev Tools
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="w-72 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl text-sm overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-700 bg-gray-800">
            <span className="text-amber-400 font-bold text-xs uppercase tracking-wider">Dev Tools</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-gray-400 hover:text-white text-lg leading-none"
            >
              x
            </button>
          </div>

          <div className="p-3 space-y-2">
            {/* Current user */}
            {tokenInfo?.email ? (
              <div className="bg-gray-800 rounded-lg px-3 py-2 text-xs">
                <p className="text-gray-400">Logged in as</p>
                <p className="text-white font-medium truncate">{tokenInfo.email}</p>
                <p className="text-gray-400">
                  KYC: <span className={
                    tokenInfo.kycStatus === 'approved' ? 'text-green-400' : 'text-yellow-400'
                  }>{tokenInfo.kycStatus}</span>
                </p>
              </div>
            ) : (
              <div className="bg-gray-800 rounded-lg px-3 py-2 text-xs text-gray-400">
                Not logged in
              </div>
            )}

            {/* Auto login */}
            <button
              type="button"
              onClick={() => void handleAutoLogin()}
              disabled={busy === 'login'}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium py-2 px-3 rounded-lg transition-colors"
            >
              {busy === 'login' ? 'Logging in...' : 'Auto-login as Test User'}
            </button>

            {/* Approve KYC */}
            <button
              type="button"
              onClick={() => void handleApproveKyc()}
              disabled={busy === 'kyc'}
              className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-medium py-2 px-3 rounded-lg transition-colors"
            >
              {busy === 'kyc' ? 'Approving...' : 'Approve KYC'}
            </button>

            {/* Seed data */}
            <button
              type="button"
              onClick={() => void handleSeed()}
              disabled={busy === 'seed'}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-medium py-2 px-3 rounded-lg transition-colors"
            >
              {busy === 'seed' ? 'Seeding...' : 'Seed test data'}
            </button>

            {/* Invite URL */}
            {inviteUrl && (
              <div className="bg-gray-800 rounded-lg px-3 py-2">
                <p className="text-gray-400 text-xs mb-1">Invite URL</p>
                <p className="text-blue-300 text-xs truncate font-mono">{inviteUrl}</p>
                <button
                  type="button"
                  onClick={handleCopyInvite}
                  className="mt-1.5 text-xs text-amber-400 hover:text-amber-300"
                >
                  {copied ? 'Copied!' : 'Copy invite link'}
                </button>
              </div>
            )}

            {/* Status messages */}
            {msg && (
              <p className={`text-xs px-1 ${msg.includes('error') || msg.includes('Error') || msg.includes('first') || msg.includes('Invalid') ? 'text-red-400' : 'text-green-400'}`}>
                {msg}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
