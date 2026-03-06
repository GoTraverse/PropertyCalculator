# EquitySight

**Australian property investment calculator** — analyse purchase costs, renovation budgets, repayments, rental overlap, 30-year projections, and risk scenarios in one place.

---

## What It Does

| Tab | What it shows |
|-----|--------------|
| **Costs** | Full purchase cost breakdown — stamp duty, legal, inspections, etc. |
| **Renovation** | Itemised reno budget with progress bar and totals |
| **Repayments** | Monthly repayments, amortisation table, extra repayment impact |
| **Rent Overlap** | Cost of carrying both a current rental and new mortgage |
| **Projection** | 30-year equity/value chart, quarterly table, early payoff scenarios |
| **Risk** | LVR, debt-to-income, buffer runway, stress-test indicators |

Other features:
- Save multiple property **scenarios** per account
- Government **grant/scheme** eligibility (configured per state in admin)
- **Suburb growth rate** auto-lookup and 30-day cache
- **PDF export** — print-optimised standalone snapshot
- **Photo** attach — paste URL or drag-and-drop image
- **PWA** — installable on iOS/Android, offline-capable

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Plain HTML + CSS + vanilla JS — no framework, no build step |
| Backend | Netlify Functions (Node.js serverless) |
| Database | Upstash Redis (REST API) |
| Auth | Custom token-based auth in `netlify/functions/auth.js` |
| Payments | Stripe (subscriptions) |
| Hosting | Netlify (git push to deploy) |

---

## Project Structure

```
/
├── app.html / app.css / app.js     # Main calculator (requires auth)
├── admin.html / admin.css / admin.js # Admin dashboard (requires role=admin)
├── index.html / index.css          # Landing page
├── login.html / login.css          # Sign-in / sign-up
├── account.html                    # User account & subscription
├── pricing.html                    # Pricing page
├── shared.css                      # Design tokens + shared components
├── auth-nav.js                     # Injects nav header on every page
├── footer.js                       # Injects footer on every page
├── netlify/functions/
│   ├── auth.js                     # All auth + admin actions
│   ├── scenarios.js                # Scenario save/load/delete
│   ├── stripe.js                   # Subscription management
│   └── photo.js                    # Property photo proxy
├── netlify.toml                    # Build config + CSP headers
├── CODEBASE.md                     # Developer architecture guide
└── TODO.txt                        # Live task list
```

> For a full developer guide including auth model, session keys, design tokens, CSP notes, and coding conventions — read **`CODEBASE.md`**.

---

## Environment Variables

Set in **Netlify → Site Settings → Environment Variables**:

| Variable | Purpose |
|----------|---------|
| `UPSTASH_REDIS_REST_URL` | Upstash Redis endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis auth token |
| `AUTH_SALT` | Password hashing salt (strong random secret) |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |

---

## Development

No build step. Edit files locally, push to git — Netlify deploys automatically.

```bash
# Run locally with Netlify CLI (requires env vars set in .env or Netlify dashboard)
npx netlify dev
```

- **Plans**: `free` | `pro` | `adviser` — stored in session and Redis user record
- **Roles**: `user` | `admin` — admin unlocks `admin.html`
- **Task tracking**: see `TODO.txt` — update it when completing or adding tasks

---

## Plans

| Plan | Features |
|------|---------|
| Free | Single scenario, basic calculator |
| Pro | Unlimited scenarios, projections, PDF export, suburb growth lookup |
| Adviser | Pro + multi-client management (coming soon) |

---

## Contributing / Handoff

If picking up this project for the first time:
1. Read `CODEBASE.md` — architecture, file map, auth model, conventions
2. Read `TODO.txt` — current open tasks
3. Set up environment variables (table above)
4. Run `npx netlify dev` to develop locally with functions

When making changes: update `CODEBASE.md` if the architecture changes, and update `TODO.txt` as tasks are completed or discovered.
