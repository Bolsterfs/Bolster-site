# Bolster

**Community-powered debt relief platform.**  
When you can't carry it alone.

---

## What Bolster does

Bolster enables friends and family (contributors) to pay a person's debts (recipient) directly to creditors via UK open banking — protecting the recipient's credit score, removing the cash handoff awkwardness, and giving contributors certainty that funds reached their destination.

**Money never passes through the recipient's account.** It routes:  
`contributor's bank → TrueLayer PIS → UK Faster Payments → creditor (~90 seconds)`

---

## Architecture

```
bolster/
├── backend/      Node.js 22 + TypeScript + Fastify 5
├── frontend/     Next.js 14 (PWA, mobile-first)
└── docs/
    └── compliance/  AML policy, Vulnerable Customers policy
```

**Key services**: TrueLayer (open banking), Onfido (KYC), Comply Advantage (AML)  
**Database**: PostgreSQL 16 + Redis (via Docker Compose locally)  
**Infrastructure**: AWS eu-west-2 ECS Fargate (production)

---

## Prerequisites

- Node.js 22+ (`node --version`)
- Docker + Docker Compose (for local database)
- A paid Anthropic account (for Claude Code)
- TrueLayer sandbox account (free at truelayer.com)
- Onfido sandbox account (free at onfido.com)

---

## Local setup

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/bolster.git
cd bolster
npm install
```

### 2. Environment variables

```bash
cp .env.example .env
# Edit .env — minimum required for local dev:
# DATABASE_URL, REDIS_URL, JWT secrets, TRUELAYER_*, ONFIDO_*, INVITE_SECRET
```

### 3. Start infrastructure

```bash
docker compose up -d
# PostgreSQL on :5432, Redis on :6379
```

### 4. Run database migrations

```bash
npm run db:migrate --workspace=backend
```

### 5. Start development servers

```bash
npm run dev
# Backend:  http://localhost:3001
# Frontend: http://localhost:3000
# Health:   http://localhost:3001/health
```

---

## Development workflow

**Every change goes through a pull request — no direct pushes to main.**

```bash
# 1. Create feature branch
git checkout -b feature/your-feature-name

# 2. Make changes — use Claude Code
claude

# 3. Run tests
npm test --workspace=backend

# 4. Lint and typecheck
npm run lint

# 5. Commit and push
git add -A
git commit -m "Add recipient invite creation flow"
git push origin feature/your-feature-name

# 6. Open PR on GitHub → review diff → merge
```

---

## API overview

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/auth/register` | None | Register recipient |
| POST | `/api/v1/auth/login` | None | Login |
| POST | `/api/v1/auth/refresh` | None | Refresh access token |
| GET | `/api/v1/debts` | JWT | List recipient's debts |
| POST | `/api/v1/debts` | JWT + KYC | Link a new debt |
| GET | `/api/v1/invites/resolve/:token` | **None** | Resolve invite (contributor) |
| POST | `/api/v1/invites` | JWT + KYC | Create invite |
| DELETE | `/api/v1/invites/:id` | JWT | Revoke invite |
| POST | `/api/v1/payments/initiate` | **None** | Initiate payment (contributor) |
| GET | `/api/v1/payments/:id/status` | **None** | Check payment status |
| POST | `/webhooks/truelayer` | Signature | TrueLayer payment events |
| POST | `/webhooks/onfido` | Signature | Onfido KYC results |
| GET | `/health` | None | Health check |

---

## Key business rules

1. Recipients must pass KYC (Onfido) before creating any invite
2. AML screening (Comply Advantage) runs on all contributors before payment
3. Creditor accounts are verified via Confirmation of Payee before use
4. Money **never** sits in a Bolster account — always pass-through
5. Every payment generates a Consumer Duty outcome record
6. Audit log is immutable — no updates or deletes ever

---

## Compliance documents

- `docs/compliance/aml-policy.md` — Required by TrueLayer before production access
- `docs/compliance/vulnerable-customers.md` — Required under FCA FG21/1

---

## Running tests

```bash
# All backend tests
npm test --workspace=backend

# Watch mode
npm run test:watch --workspace=backend

# Specific test file
npx vitest run src/utils/fees.test.ts
```

---

## Contributing

See `CLAUDE.md` for project context, conventions, and critical business rules.  
All contributions via pull request. CI must pass before merge.
