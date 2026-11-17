# Deploying the Bolster TEST environment to Railway

One Railway project, three services, one bill (~£10–15/month on Hobby):

| Service   | What it is                       | Where it lives                      |
|-----------|----------------------------------|-------------------------------------|
| postgres  | Railway's managed Postgres       | internal only                       |
| backend   | Fastify API (this repo, backend/) | https://api.bolsterfs.co.uk         |
| frontend  | Next.js app (this repo, frontend/)| https://app.bolsterfs.co.uk         |

Redis is NOT needed for this deployment (no background workers run yet).

This is a **test** deployment: Stripe stays in test mode, test creditors are
loaded automatically, Dev Tools and the identity-check bypass are available,
and every page carries an amber "Test version — no real money moves" banner.
All of that is switched by `APP_STAGE=test`. Changing it to `live` turns all of
it off — do not do that until the go-live checklist in the handover is done.

---

## 0. Before you start (10 min, once)

1. GitHub repo `Bolsterfs/Bolster-site` is up to date (`git push` from WSL).
2. Generate three fresh secrets for the hosted environment (never reuse the laptop ones).
   In WSL, run this three times and keep the outputs:
   ```
   openssl rand -base64 48
   ```
   They will become `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `INVITE_SECRET`.
3. Have `~/bolster/bolster/backend/.env` open — several values are copied from it.

## 1. Create the Railway project

1. railway.com → sign up / log in with GitHub. Choose the **Hobby** plan ($5/mo, card required).
2. **New Project → Deploy from GitHub repo → Bolsterfs/Bolster-site.** Railway creates one
   service from the repo. Rename it **backend** (Settings → Service name).
3. In the project, **+ New → Database → PostgreSQL.** Rename it **postgres** if you like.
4. **+ New → GitHub Repo → Bolsterfs/Bolster-site** again. Rename this one **frontend**.

## 2. Build and start settings (per service)

Railway's "config file" option is deprecated (stops working 1 Dec 2026), so set these
by hand in each service's **Settings** page. The `railway.*.json` files in the repo are
kept only as a readable record.

Each service has **Root Directory** set to its own folder, so commands run *inside*
that folder (no `cd`, no `--workspace`). Railway still installs from the repo's root
lockfile because the folders are npm workspaces.

**backend** → Settings
- Source → Root Directory: `/backend`
- Build → Build Command: `npm run build`
- Deploy → Custom Start Command: `node dist/db/migrate.js && node dist/server.js`
- Deploy → Healthcheck Path: `/health`
- Watch Paths: leave empty (root directory already limits it)

**frontend** → Settings
- Source → Root Directory: `/frontend`
- Build → Build Command: `npm run build`
- Deploy → Custom Start Command: `npm run start`
- Watch Paths: leave empty

## 3. Variables — backend

Settings → Variables on the **backend** service. Use "Raw editor" and paste, then
fill in the blanks.

```
NODE_ENV=production
APP_STAGE=test
NIXPACKS_NODE_VERSION=22

# Railway fills this in when you reference the postgres service:
DATABASE_URL=${{Postgres.DATABASE_URL}}

JWT_ACCESS_SECRET=<fresh secret 1>
JWT_REFRESH_SECRET=<fresh secret 2>
INVITE_SECRET=<fresh secret 3>

APP_URL=https://app.bolsterfs.co.uk
API_URL=https://api.bolsterfs.co.uk
INVITE_BASE_URL=https://app.bolsterfs.co.uk
# (site root — the backend adds /i/<code> itself; "…/invite" also accepted)

# Stripe — TEST keys, copied from backend/.env (sk_test_… / pk_test_…)
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_CONNECT_ACCOUNT_ID=
# Leave STRIPE_WEBHOOK_SECRET out until step 7

# Feature flags — same as the laptop
ENABLE_PAYMENT_INITIATION=false
ENABLE_AML_SCREENING=false
ENABLE_KYC_VERIFICATION=true

# Fees
BOLSTER_FEE_PERCENTAGE=1.5
BOLSTER_FEE_MIN_PENCE=100
BOLSTER_FEE_MAX_PENCE=1500

# Who gets the Admin link
ADMIN_EMAILS=<your login email on the hosted app>

# Required by the config check but not yet in use — copy the placeholder
# values straight from backend/.env:
TRUELAYER_CLIENT_ID=
TRUELAYER_CLIENT_SECRET=
TRUELAYER_REDIRECT_URI=https://api.bolsterfs.co.uk/api/v1/payments/callback
TRUELAYER_WEBHOOK_SECRET=
TRUELAYER_AUTH_URL=https://auth.truelayer-sandbox.com
TRUELAYER_API_URL=https://api.truelayer-sandbox.com
VERIFF_API_KEY=
VERIFF_SECRET_KEY=
COMPLY_ADVANTAGE_API_KEY=
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=noreply@bolsterfs.co.uk
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
```

Notes
- `DATABASE_URL=${{Postgres.DATABASE_URL}}` is a Railway *reference*; type it exactly
  (the service name inside must match your Postgres service's name).
- With a placeholder SendGrid key, emails are not sent — they print in the backend's
  **Deploy Logs** on Railway, exactly as in the laptop terminal. That is where the
  password-reset link and receipts appear on the test deployment.
- `ANTHROPIC_API_KEY` is optional; add it to turn on bill scanning.

## 4. Variables — frontend

```
NODE_ENV=production
NEXT_PUBLIC_APP_STAGE=test
NIXPACKS_NODE_VERSION=22
API_URL=https://api.bolsterfs.co.uk
```

`API_URL` is read when the frontend is **built** (it configures the /api/v1 proxy),
so if you ever change it, trigger a redeploy of the frontend.

## 5. Domains

For each service: Settings → Networking → **Custom Domain**. Railway asks for the port
the app listens on — use the port shown in that service's Deploy Logs, NOT the laptop port:
- backend → `api.bolsterfs.co.uk`, port **3001** (we set `PORT=3001` on the backend)
- frontend → `app.bolsterfs.co.uk`, port **8080** (Railway injects PORT; Next.js logs
  `Local: http://localhost:8080`). Getting this wrong gives "Application failed to respond";
  fix by editing the domain row's port — no redeploy needed.

Railway shows TWO records per domain: a CNAME and a `_railway-verify.<name>` TXT record.
Add both. At one.com the Hostname box takes only the part before `.bolsterfs.co.uk`
(e.g. `app`, `_railway-verify.app`) — the suffix is added for you.

Railway shows a CNAME target for each. At one.com → DNS for bolsterfs.co.uk, add:

| Type  | Host | Points to                     |
|-------|------|-------------------------------|
| CNAME | api  | (the target Railway shows)    |
| CNAME | app  | (the target Railway shows)    |

Certificates are issued automatically once DNS resolves (a few minutes to an hour).
Until then you can use the `*.up.railway.app` addresses Railway gives each service —
but then `APP_URL`/`API_URL` above must match those temporarily.

## 6. Deploy and check

Both services redeploy when variables change. Watch **backend → Deploy Logs** for:

```
Running database migrations...  Migrations complete.
Added 8 test creditor(s) for development
Bolster backend running on port ████ [production, TEST stage]
Stripe reconciliation sweep every 300s
```

Then `https://api.bolsterfs.co.uk/health` should answer, and `https://app.bolsterfs.co.uk/register`
should show the amber test banner. Register, approve identity (test), add a debt from the
test creditors, create an invite — open it on your phone.

## 7. Stripe webhook (makes confirmations instant)

Stripe dashboard (TEST mode) → Developers → Webhooks → **Add endpoint**
- URL: `https://api.bolsterfs.co.uk/webhooks/stripe`
- Events: `checkout.session.completed`
- Because payments use Stripe Connect direct charges, tick **"Listen to events on
  Connected accounts"** as well.
- Copy the **Signing secret** (`whsec_…`) → backend variable `STRIPE_WEBHOOK_SECRET`.

Without this, payments still settle — the reconciliation sweep checks Stripe every
5 minutes and the confirmation page checks on its own — it is just slower.

## 8. Veriff (optional, test stage)

On https the real Veriff sandbox check can round-trip. In the Veriff dashboard set
the webhook URL to `https://api.bolsterfs.co.uk/webhooks/veriff`. The "Approve my
identity (test)" button remains available regardless.

---

## Everyday use after setup

- **Deploy a change:** push to `main` on GitHub. Railway rebuilds whichever service's
  files changed (backend/** or frontend/**) within a couple of minutes.
- **Logs / emails:** Railway → backend → Deploy Logs.
- **Spending cap:** Railway → project → Settings → Usage limits. Set one (e.g. $20)
  so a bug can never run up a bill.
- **Database:** Railway → postgres → Data tab lets you browse tables.

## Going live later (not now)

Change `APP_STAGE` to `live` and `NEXT_PUBLIC_APP_STAGE` to `live`, swap Stripe
to live keys, add the real Comply Advantage / SendGrid / Twilio keys, load real
creditors, and complete the "Before real users" list in the handover. Live stage
registers no dev routes and serves no test creditors.
