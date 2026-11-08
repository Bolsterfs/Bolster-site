import type { CSSProperties, FocusEvent, ReactNode } from 'react'

/**
 * Shared layout and styles for the warm-theme account pages (forgot password,
 * reset password). Matches the look of the login and registration pages.
 */

const PURPLE = '#6B21A8'

export const labelStyle: CSSProperties = {
  display: 'block', fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '6px',
}

export const inputStyle: CSSProperties = {
  width: '100%', backgroundColor: '#FFFFFF', border: '1.5px solid #E2D9F3', borderRadius: '12px',
  padding: '12px 16px', fontSize: '15px', color: '#1A0533', outline: 'none', boxSizing: 'border-box',
}

export const linkStyle: CSSProperties = {
  color: PURPLE, fontWeight: 600, textDecoration: 'none',
}

export function primaryButtonStyle(enabled: boolean): CSSProperties {
  return {
    width: '100%', backgroundColor: PURPLE, opacity: enabled ? 1 : 0.5, color: 'white',
    fontSize: '16px', fontWeight: 700, letterSpacing: '0.02em', padding: '14px 24px',
    borderRadius: '12px', border: 'none', cursor: enabled ? 'pointer' : 'not-allowed',
    display: 'block', textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box',
  }
}

/** Focus ring handlers for inputs using inputStyle. */
export const inputFocusHandlers = {
  onFocus: (e: FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = PURPLE
    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(107,33,168,0.12)'
  },
  onBlur: (e: FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = '#E2D9F3'
    e.currentTarget.style.boxShadow = 'none'
  },
}

export function ErrorBanner({ children }: { children: ReactNode }) {
  return (
    <div role="alert" style={{ borderRadius: '12px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', padding: '12px 16px', marginBottom: '16px' }}>
      <p style={{ color: '#DC2626', fontSize: '14px', margin: 0 }}>{children}</p>
    </div>
  )
}

interface AuthShellProps {
  icon:      string
  title:     ReactNode
  subtitle?: ReactNode
  children:  ReactNode          // goes inside the white card
  footer?:   ReactNode          // below the card
}

export default function AuthShell({ icon, title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#FAFAF8', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '20px 16px' }}>
        <div style={{ maxWidth: '480px', margin: '0 auto' }}>
          <span style={{ color: PURPLE, fontWeight: 800, fontSize: '20px', letterSpacing: '0.05em' }}>BOLSTER</span>
        </div>
      </header>

      <main style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px 64px' }}>
        <div style={{ width: '100%', maxWidth: '440px' }}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div aria-hidden="true" style={{ backgroundColor: '#F3E8FF', borderRadius: '50%', width: '80px', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: '40px' }}>{icon}</div>
            <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#1A0533', lineHeight: 1.2, margin: 0 }}>{title}</h1>
            {subtitle && (
              <p style={{ color: '#6B7280', marginTop: '12px', fontSize: '16px', lineHeight: 1.6 }}>{subtitle}</p>
            )}
          </div>

          <div style={{ backgroundColor: '#FFFFFF', borderRadius: '20px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '28px' }}>
            {children}
          </div>

          {footer && (
            <div style={{ textAlign: 'center', color: '#6B7280', fontSize: '14px', marginTop: '24px' }}>{footer}</div>
          )}
        </div>
      </main>
    </div>
  )
}
