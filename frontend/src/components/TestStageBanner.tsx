import { isTestStage } from '../lib/stage'

/**
 * Thin strip at the very top of every page in a test environment, so nobody
 * who is handed a link mistakes it for the real service. Renders nothing live.
 */
export default function TestStageBanner() {
  if (!isTestStage) return null
  return (
    <div
      role="status"
      className="bg-amber-500 text-amber-950 text-center text-xs font-semibold px-4 py-1.5 tracking-wide print:hidden"
    >
      Test version — no real money moves. Card payments use Stripe test cards (4242 4242 4242 4242).
    </div>
  )
}
