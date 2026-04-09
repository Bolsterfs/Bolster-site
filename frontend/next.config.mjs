/** @type {import('next').NextConfig} */
const nextConfig = {
  // API calls go to the backend service
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${process.env.API_URL}/api/v1/:path*`,
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
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://sdk.onfido.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob:",
              "connect-src 'self' https://api.eu.onfido.com https://auth.truelayer-sandbox.com",
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
