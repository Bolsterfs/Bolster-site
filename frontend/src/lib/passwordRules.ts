/**
 * Password rules shown as a live checklist on registration and password reset.
 * These mirror the server's password policy (backend passwordSchema) — the
 * server remains the authority; this is only for immediate feedback.
 */
export const PASSWORD_RULES = [
  { id: 'length',    label: 'At least 12 characters',         test: (p: string) => p.length >= 12 },
  { id: 'uppercase', label: 'One uppercase letter (A-Z)',     test: (p: string) => /[A-Z]/.test(p) },
  { id: 'lowercase', label: 'One lowercase letter (a-z)',     test: (p: string) => /[a-z]/.test(p) },
  { id: 'number',    label: 'One number (0-9)',               test: (p: string) => /[0-9]/.test(p) },
  { id: 'special',   label: 'One special character (!@#$%^&*)', test: (p: string) => /[!@#$%^&*()\-_=+[\]{};:'",.<>/?\\|`~]/.test(p) },
] as const

export const STRENGTH_LABELS = ['Weak', 'Fair', 'Good', 'Strong'] as const

export interface PasswordCheck {
  rules:         Array<{ id: string; label: string; met: boolean }>
  allRulesMet:   boolean
  filledBars:    number          // 0-4
  strengthLabel: string          // '' when nothing typed
}

export function checkPassword(password: string): PasswordCheck {
  const rules = PASSWORD_RULES.map((rule) => ({
    id:    rule.id,
    label: rule.label,
    met:   rule.test(password),
  }))
  const metCount = rules.filter((r) => r.met).length

  // Map 0-5 met rules → 0-4 filled bars (only all 5 = Strong)
  const filledBars =
    metCount === 0 ? 0 :
    metCount <= 2 ? 1 :
    metCount === 3 ? 2 :
    metCount === 4 ? 3 : 4

  return {
    rules,
    allRulesMet:   metCount === PASSWORD_RULES.length,
    filledBars,
    strengthLabel: filledBars === 0 ? '' : STRENGTH_LABELS[filledBars - 1] ?? '',
  }
}
