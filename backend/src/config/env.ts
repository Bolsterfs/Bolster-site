import { z } from 'zod'
import 'dotenv/config'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url(),

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
  STRIPE_SECRET_KEY:      z.string().min(1).optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET:  z.string().min(1).optional(),

  // Comply Advantage
  COMPLY_ADVANTAGE_API_KEY: z.string().min(1),
  COMPLY_ADVANTAGE_FUZZINESS: z.coerce.number().min(0).max(1).default(0.6),

  // Notifications
  SENDGRID_API_KEY: z.string().min(1),
  SENDGRID_FROM_EMAIL: z.string().email(),
  TWILIO_ACCOUNT_SID: z.string().min(1),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  TWILIO_FROM_NUMBER: z.string().min(1),

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
  ENABLE_AML_SCREENING: z.coerce.boolean().default(true),
  ENABLE_KYC_VERIFICATION: z.coerce.boolean().default(true),
  ENABLE_PAYMENT_INITIATION: z.coerce.boolean().default(true),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Invalid environment variables:')
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data
export type Env = typeof env
