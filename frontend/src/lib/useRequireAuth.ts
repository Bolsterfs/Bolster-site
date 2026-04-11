'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getAccessToken } from './api'

/**
 * Redirects to /login if there is no access token in the current session.
 * Returns `isChecking: true` until the client-side check is complete so
 * callers can render a loading state and avoid a flash of protected content.
 *
 * Usage:
 *   const { isChecking } = useRequireAuth()
 *   if (isChecking) return <LoadingScreen />
 */
export function useRequireAuth(): { isChecking: boolean } {
  const router = useRouter()
  // Start as "checking" — we only know the real answer after the first client
  // render, because sessionStorage is unavailable during SSR.
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    if (!getAccessToken()) {
      void router.replace('/login')
    } else {
      setIsChecking(false)
    }
  }, [router])

  return { isChecking }
}
