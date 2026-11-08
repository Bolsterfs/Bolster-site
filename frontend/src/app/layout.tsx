import type { Metadata, Viewport } from 'next'
import DevTools from '../components/DevTools'
import './globals.css'

export const metadata: Metadata = {
  title:       'Bolster — When you can\'t carry it alone',
  description: 'Let the people who love you help the way they want to. Pay debts directly — safely, privately, with dignity.',
  manifest:    '/manifest.json',
  appleWebApp: {
    capable:        true,
    statusBarStyle: 'black-translucent',
    title:          'Bolster',
  },
  icons: {
    icon:  '/icon-192.png',
    apple: '/icon-apple.png',
  },
}

export const viewport: Viewport = {
  themeColor:    '#0D1B3E',
  width:         'device-width',
  initialScale:  1,
  maximumScale:  1,  // prevent zoom on form inputs (important for mobile payment forms)
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-navy text-white antialiased">
        {children}
        {process.env.NODE_ENV === 'development' && <DevTools />}
      </body>
    </html>
  )
}
