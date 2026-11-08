import { z } from 'zod'
import 'dotenv/config'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis (optional — server starts without it, but background jobs are disabled)
  // Handles undefined, null, and empty string "" from Railway env config
  REDIS_URL: z.string().optional().transform(v =>
    (v && v.trim() !== '') ? v : 'redis://localhost:6379'
  ).pipe(z.string().url()).default('redis://localhost:6379'),

  // JWT
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // TrueLayer
  TRUELAYER_CLIENT_ID: z.string().min(1),
  TRUELAYER_CLIENT_SECRET: z.string().min(1),
  TRUELAYER_REDIRECT_URI: z.string().url(),
  TRUELAYER_WEBHOOK_SECRET: z.string().min(1),
  TRUELAYER_AUTH_URL: z.string().url(),
  TRUELAYER_API_URL: z.string().url(),

  // Veriff
  VERIFF_API_KEY: z.string().min(1),
  VERIFF_SECRET_KEY: z.string().min(1),

  // Stripe (fallback when TrueLayer is disabled or fails)
  STRIPE_SECRET_KEY:          z.string().min(1).optional(),
  STRIPE_PUBLISHABLE_KEY:     z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET:      z.string().min(1).optional(),
  STRIPE_CONNECT_ACCOUNT_ID:  z.string().min(1).optional(),
  // How often to ask Stripe about card payments still pending (missed webhooks).
  STRIPE_RECONCILE_INTERVAL_MS: z.coerce.number().int().min(30_000).default(5 * 60 * 1000),

  // Comply Advantage
  COMPLY_ADVANTAGE_API_KEY: z.string().min(1),
  COMPLY_ADVANTAGE_FUZZINESS: z.coerce.number().min(0).max(1).default(0.6),

  // Notifications
  SENDGRID_API_KEY: z.string().min(1),
  SENDGRID_FROM_EMAIL: z.string().email(),
  TWILIO_ACCOUNT_SID: z.string().min(1),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  TWILIO_FROM_NUMBER: z.string().min(1),

  // Bill scanning (optional). Without a key the scan option is simply off.
  ANTHROPIC_API_KEY: z.string().optional(),
  BILL_SCAN_MODEL:   z.string().min(1).default('claude-haiku-4-5-20251001'),

  // Staff who may use the admin screens (comma-separated emails, case-insensitive).
  // Empty means nobody — the admin routes return 403 for everyone.
  ADMIN_EMAILS: z.string().default('').transform((v) =>
    v.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean),
  ),

  // App
  APP_URL: z.string().url(),
  API_URL: z.string().url(),
  INVITE_BASE_URL: z.string().url(),
  INVITE_SECRET: z.string().min(32),

  // Fees
  MAX_PAYMENT_AMOUNT_PENCE: z.coerce.number().int().positive().default(150000),
  MIN_PAYMENT_AMOUNT_PENCE: z.coerce.number().int().positive().default(100),
  BOLSTER_FEE_PERCENTAGE: z.coerce.number().min(0).max(100).default(1.5),
  BOLSTER_FEE_MIN_PENCE: z.coerce.number().int().positive().default(100),
  BOLSTER_FEE_MAX_PENCE: z.coerce.number().int().positive().default(1500),

  // Feature flags
  ENABLE_AML_SCREENING: z.string().default('true').transform((v) => v.trim().toLowerCase() === 'true'),
  ENABLE_KYC_VERIFICATION: z.string().default('true').transform((v) => v.trim().toLowerCase() === 'true'),
  ENABLE_PAYMENT_INITIATION: z.string().default('false').transform((v) => v.trim().toLowerCase() === 'true'),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Invalid environment variables:')
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data
export type Env = typeof env
