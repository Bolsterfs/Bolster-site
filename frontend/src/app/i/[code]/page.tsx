'use client'

import { useParams } from 'next/navigation'
import InvitePage from '../../invite/[token]/page'

/**
 * Short invite link: /i/<code>. Same page as /invite/<token> — the backend's
 * resolve endpoint accepts either the 9-character code or the long signed token.
 */
export default function ShortInvitePage() {
  // The invite page reads its own params; this route just exists so the short
  // path matches. useParams is called so Next treats this as a dynamic client page.
  useParams<{ code: string }>()
  return <InvitePage />
}
