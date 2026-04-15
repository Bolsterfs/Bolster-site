/** @type {import('next').NextConfig} */
const nextConfig = {
  // Expose backend URL to the Next.js server (used by the rewrite proxy).
  // Not prefixed with NEXT_PUBLIC_ — server-side only, never sent to the browser.
  env: {
    API_URL: process.env.API_URL ?? 'http://localhost:3001',
  },

  // API calls go to the backend service
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${process.env.API_URL ?? 'http://localhost:3001'}/api/v1/:path*`,
      },
    ]
  },

  // Security headers — important for a financial application
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options',           value: 'DENY' },
          { key: 'X-Content-Type-Options',     value: 'nosniff' },
          { key: 'Referrer-Policy',            value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',         value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob:",
              "connect-src 'self' https://auth.truelayer-sandbox.com",
              "frame-src 'none'",
            ].join('; '),
          },
        ],
      },
    ]
  },

  // PWA manifest is served as a static file
  // Install next-pwa or use the static manifest approach for MVP
  reactStrictMode: true,
  poweredByHeader: false,

  // TypeScript strict checking during build
  typescript: { ignoreBuildErrors: false },
  eslint:     { ignoreDuringBuilds: false },
}

export default nextConfig
