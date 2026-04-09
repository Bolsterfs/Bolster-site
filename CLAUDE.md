# Bolster — CLAUDE.md

## What Bolster is
A three-sided UK fintech platform enabling friends and family (contributors)
to pay a person's debts (recipient) directly to creditors via open banking.
Money NEVER passes through the recipient's account — it routes contributor →
TrueLayer PIS → UK Faster Payments → creditor account in ~90 seconds.

## The three users
- **Recipient**: Person in financial hardship. Links debts, sets privacy, sends private invites.
- **Contributor**: Friend or family member. Receives invite, pays directly to creditor.
- **Institution**: BNPL provider / bank / council. Receives payment + Consumer Duty outcome record.

## Tech stack
- **Backend**: Node.js 22 + TypeScript + Fastify 5
- **ORM**: Drizzle ORM + PostgreSQL 16 (AWS RDS eu-west-2)
- **Queue**: BullMQ + Redis
- **Frontend**: Next.js 14 (PWA, mobile-first)
- **Open banking**: TrueLayer (PIS + AIS) — primary; Yapily fallback
- **KYC**: Onfido (document + liveness, ~£1–3/check)
- **AML**: Comply Advantage (sanctions + PEP screening)
- **Infrastructure**: AWS eu-west-2 (London), ECS Fargate, CloudFront

## Project structure
```
bolster/
├── backend/
│   └── src/
│       ├── api/
│       │   ├── routes/          # Fastify route handlers
│       │   ├── hooks/           # Auth, rate limiting, request lifecycle
│       │   └── plugins/         # Fastify plugins (cors, jwt, swagger)
│       ├── db/
│       │   ├── schema/          # Drizzle table definitions
│       │   └── migrations/      # SQL migration files
│       ├── services/
│       │   ├── payment/         # TrueLayer PIS integration
│       │   ├── kyc/             # Onfido integration
│       │   ├── aml/             # Comply Advantage integration
│       │   ├── invite/          # Invite generation + management
│       │   └── notification/    # Email + SMS notifications
│       ├── workers/             # BullMQ job handlers
│       ├── types/               # Shared TypeScript types + Zod schemas
│       ├── utils/               # Crypto, date helpers, audit logger
│       └── config/              # Environment config with validation
├── frontend/
│   └── src/
│       ├── app/                 # Next.js App Router
│       ├── components/          # React components
│       └── lib/                 # API client, utilities
└── docs/
    └── compliance/              # AML policy, vulnerable customers policy
```

## Commands
- `npm run dev` — start both backend and frontend
- `npm run dev --workspace=backend` — backend only (port 3001)
- `npm run dev --workspace=frontend` — frontend only (port 3000)
- `npm run db:migrate` — run database migrations
- `npm run db:studio` — open Drizzle Studio
- `npm test` — run backend tests
- `npm run lint` — ESLint across workspace

## Critical business rules — NEVER violate these
1. **Money routing**: contributor → TrueLayer PIS → Faster Payments → creditor ONLY
   Bolster NEVER holds funds. No Bolster bank account in the payment path.
2. **KYC gate**: Recipients MUST pass Onfido verification before creating any invite
3. **AML screening**: ALL contributors screened via Comply Advantage before payment initiation
4. **Sanctions**: Real-time UK sanctions list + PEP check on all parties
5. **Audit log**: Every payment event written to audit_log table — IMMUTABLE, never update/delete
6. **Privacy**: Recipient controls exactly what contributor sees — never expose more than permitted
7. **Consent**: Only recipient can create invites. Contributor cannot initiate payment unprompted.
8. **CoP**: Confirmation of Payee check on creditor account before first payment to that account
9. **SCA**: Strong Customer Authentication handled by TrueLayer redirect — NEVER capture bank credentials
10. **Consumer Duty**: Every resolved payment generates a timestamped outcome record

## TypeScript conventions
- Strict mode enabled — `noImplicitAny: true`, `strictNullChecks: true`
- No `any` types — use `unknown` and narrow properly
- All external API responses validated with Zod schemas before use
- Error types must be explicit — no throwing raw strings
- Use `Result<T, E>` pattern for operations that can fail
- Database queries only through Drizzle — no raw SQL except in migrations

## Database conventions
- All tables have `id` (UUID), `created_at`, `updated_at`
- Soft deletes via `deleted_at` — never hard delete financial records
- All amounts in pence (integer) — never use floats for money
- 5-year minimum retention on all financial and KYC records (MLR 2017)
- Row-level security enabled on all user-scoped tables

## API conventions
- REST with JSON — versioned at /api/v1/
- Authentication via JWT (short-lived access token + refresh token)
- All routes protected by auth hook except: /health, /webhooks/*, /invite/:token
- Rate limiting on all public endpoints
- Request/response schemas validated with Zod + documented with JSON Schema
- Webhook endpoints verify signatures before processing

## Git conventions
- All changes via pull request — no direct pushes to main
- Commit messages: imperative mood, under 72 characters
- Branch naming: feature/description, fix/description, chore/description
- Every PR must include: what changed, why, and how to test

## Regulatory context
- Operating as TrueLayer agent under their FCA PISP licence (MVP)
- TrueLayer agent agreement in /docs/compliance/trueLAyer-agent-agreement.md
- AML policy: /docs/compliance/aml-policy.md
- Vulnerable Customers Policy: /docs/compliance/vulnerable-customers.md
- Consumer Duty Assessment: /docs/compliance/consumer-duty-assessment.md
- ICO registered as data controller (UK GDPR / DPA 2018)
- All data in AWS eu-west-2 (London) — UK data residency

## Environment variables (see .env.example)
Database, Redis, TrueLayer, Onfido, Comply Advantage, JWT secrets,
AWS credentials, SendGrid (email), Twilio (SMS)
