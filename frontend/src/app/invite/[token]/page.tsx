import { notFound } from 'next/navigation'
import PayContributorFlow from '../../../components/payment/PayContributorFlow'

/**
 * Public invite page — no authentication required.
 * This is what the contributor (friend/family member) sees when they
 * open the private link the recipient shared with them.
 *
 * The page fetches invite details server-side and passes to the client
 * payment flow component.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  // Fetch invite details server-side (better for SEO and initial load).
  // Wrap in try-catch: if API_URL is misconfigured or the backend is down,
  // fetch() throws a TypeError — without this it propagates as an unhandled
  // Server Component error and Next.js shows a generic error page.
  let invite: unknown
  try {
    const response = await fetch(
      `${process.env.API_URL}/api/v1/invites/resolve/${token}`,
      { cache: 'no-store' }, // invites must always be fresh
    )

    if (!response.ok) {
      // Expired, revoked, or non-existent token — show a friendly not-found page
      notFound()
    }

    const body = await response.json() as { data: unknown }
    invite = body.data
  } catch {
    // Network error or invalid API_URL — treat as not found rather than 500
    notFound()
  }

  // Narrow the type now that we know the fetch succeeded
  const typedInvite = invite as import('../../../lib/api').ResolvedInvite

  return (
    <main className="min-h-screen bg-navy flex flex-col">
      {/* Top bar */}
      <header className="px-4 py-4 border-b border-blue-900/40">
        <div className="max-w-md mx-auto flex items-center gap-2">
          <span className="text-white font-bold text-xl tracking-wide">BOLSTER</span>
          <span className="text-mid-gray text-sm">· Secure payment</span>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-start px-4 py-8">
        <div className="w-full max-w-md">
          {/* Privacy-appropriate greeting */}
          <div className="mb-8 text-center">
            <div className="w-16 h-16 bg-teal-900/40 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">💙</span>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">
              {typedInvite.recipientFirstName} needs your help
            </h1>
            <p className="text-mid-gray text-sm leading-relaxed">
              You&apos;ve been invited to help with a payment.
              Your money goes directly to the creditor — not to {typedInvite.recipientFirstName}.
            </p>
          </div>

          {/* What the invite is for */}
          {typedInvite.personalMessage && (
            <div className="card mb-6 border-l-4 border-l-teal-500">
              <p className="text-sm text-mid-gray mb-1">Message from {typedInvite.recipientFirstName}</p>
              <p className="text-white italic">&ldquo;{typedInvite.personalMessage}&rdquo;</p>
            </div>
          )}

          {/* Debt summary */}
          <div className="card mb-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-mid-gray mb-1">Paying to</p>
                <p className="text-white font-semibold">
                  {typedInvite.debt.creditorName ?? 'Creditor (private)'}
                </p>
              </div>
              {typedInvite.debt.remainingAmountPence && (
                <div className="text-right">
                  <p className="text-sm text-mid-gray mb-1">Outstanding</p>
                  <p className="text-white font-bold">
                    {new Intl.NumberFormat('en-GB', {
                      style: 'currency', currency: 'GBP',
                    }).format(typedInvite.debt.remainingAmountPence / 100)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* The payment form */}
          <PayContributorFlow
            inviteToken={token}
            invite={typedInvite}
          />

          {/* Trust signals */}
          <div className="mt-8 flex flex-col gap-2">
            {[
              '🔒 Your bank details are never stored by Bolster',
              '⚡ Payment settles in ~90 seconds via Faster Payments',
              '✅ Money goes directly to the creditor — not to the recipient',
            ].map((line) => (
              <p key={line} className="text-xs text-mid-gray flex items-start gap-2">
                {line}
              </p>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
