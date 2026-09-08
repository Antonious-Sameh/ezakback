# System 5 — Backend

Read-only central reporting backend for the business owner's dashboard. It
aggregates data live from Shops 1-4's own `/api/admin/*` endpoints — it
holds **no shop data of its own** (no products/sales/customers database),
only the connection details needed to call each shop's backend, plus its own
single owner login. Built as a Vercel serverless function, same stack and
conventions as Shops 1-4.

## Architecture in one paragraph

```
Frontend (already built) → System 5 Backend → Shop 1 /api/admin/*
                                             → Shop 2 /api/admin/*
                                             → Shop 3 /api/admin/*
                                             → Shop 4 /api/admin/*
```

Every route (except `/health` and `/auth/login`) requires the owner's own
JWT (`Authorization: Bearer <token>`, issued by this service — completely
separate from any shop's login). Once authenticated, this backend calls the
relevant shop(s) with that shop's `ADMIN_READONLY_KEY` in an `X-Admin-Key`
header, reshapes the response where needed, and returns it. A shop that's
unreachable degrades that one shop's numbers to 0 / an `offline` badge
rather than failing the whole request — see `src/services/shopClient.service.js`.

## Stack

Node.js (ESM) + Express 4, `zod` for validation, `jsonwebtoken` + `bcryptjs`
for the owner login, `pino` for logging, `express-rate-limit` + `helmet` for
hardening, `vitest` + `supertest` for tests. No database driver — there is
no database.

## Environment variables

See `.env.example` for the full, commented list. Summary:

| Variable | Required in production? | Notes |
|---|---|---|
| `NODE_ENV` | — | `production` on Vercel |
| `CORS_ORIGINS` | Recommended | System 5 frontend's deployed URL |
| `SHOP{1-4}_NAME` | No | Display label only, defaults provided |
| `SHOP{1-4}_API_URL` / `SHOP{1-4}_ADMIN_KEY` | Yes, as a pair per shop | From that shop's own `.env` — see below |
| `SHOP_REQUEST_TIMEOUT_MS` | No | Default 8000 |
| `OWNER_PASSWORD_HASH` | **Yes** | Generate with `npm run hash-password -- "..."` |
| `OWNER_JWT_SECRET` | **Yes** | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `OWNER_TOKEN_TTL_HOURS` | No | Default 12 |

**Where `SHOP{N}_API_URL` / `SHOP{N}_ADMIN_KEY` come from:** each value was
generated when that shop's own `/api/admin/*` was added (see that shop's
`.env` → `ADMIN_READONLY_KEY`, and its Vercel deployment URL). Copy the
value, don't regenerate it here — regenerating it would require updating it
in that shop's own `.env` too.

## Local development

```bash
npm install
cp .env.example .env
# fill in .env — at minimum OWNER_PASSWORD_HASH, OWNER_JWT_SECRET, and one
# shop's SHOP1_API_URL/SHOP1_ADMIN_KEY to have something to look at
npm run hash-password -- "a-real-password"   # paste the output into .env
npm run dev
```

## Testing

```bash
npm test              # 103 tests, run once
npm run test:watch    # re-run on change
npm run test:coverage # coverage report (100% on every controller/route/
                       # middleware/service/util file; only entrypoint glue
                       # — server.js, api/index.js, the CLI script — is
                       # intentionally untested, same convention as Shops 1-4)
```

## Deploying to Vercel

1. Push this folder to its own Git repo (or Vercel project root), separate
   from all four shops and from the System 5 frontend.
2. In Vercel: New Project → import this repo.
3. Set every variable from the table above as a Vercel **Project Environment
   Variable** (never commit a real `.env`).
4. Deploy. `GET /api/health` should respond `{"success":true,"status":"ok",...}`.
5. Once the System 5 **frontend** is deployed, come back and set
   `CORS_ORIGINS` to its exact URL, then redeploy.

## Connecting the already-built frontend

The frontend's `lib/api.js` reads its backend URL from `VITE_API_BASE_URL`.
Set that to this backend's deployed URL (including `/api`), e.g.:

```
VITE_API_BASE_URL=https://system5-backend.vercel.app/api
```

No frontend code changes should be needed — every endpoint, request shape,
and response shape here was built to match `lib/api.js` and the pages that
call it exactly (see each service file's comments for where a shape was
double-checked against the actual frontend source).

## Known gaps (carried over from the build stages, not yet decided)

1. **Daily trend charts on the reports page** (`sales.byDay`, `profit.byDay`)
   are returned as empty arrays. Shops 1-4's own `/admin/reports/*` only
   return range totals, not a day-by-day breakdown — there's nothing to
   reshape here. Fix requires a small, focused addition to each shop's
   `reports.service.js` (a `$group`-by-day aggregation, same pattern already
   used there for other reports).
2. **Product `category` / `unit` fields** on the overview page's low-stock
   list are always `null` / `""` — Shops 1-4's `Product` model has no such
   fields today. Cosmetic only; the rest of each item (name, SKU, stock
   level, status) is real.

Both are documented in code (`src/services/shopReports.service.js` and
`src/services/shopOverview.service.js`) and don't block using the rest of
the dashboard.

## Endpoint reference

All under `/api`, all requiring `Authorization: Bearer <owner token>` except
`/health` and `/auth/login`.

| Method & path | Purpose |
|---|---|
| `GET /health` | Liveness check |
| `POST /auth/login` | `{ password }` → `{ token }` |
| `GET /shops` | Summary card per shop (today/month sales, status, low-stock count) |
| `GET /reports/compare?from&to` | Cross-shop sales/profit totals + breakdown |
| `GET /shops/:shopId/overview` | Quick-stat cards + low-stock list for one shop |
| `GET /shops/:shopId/cashbox/summary` | That shop's cashbox balance/today totals |
| `GET /shops/:shopId/expenses/summary` | That shop's expense totals |
| `GET /shops/:shopId/reports/:type` | `type` ∈ sales / purchases / profit / inventory / customers / suppliers |
| `GET /shops/:shopId/:entity` | `entity` ∈ products / customers / suppliers / sales / purchases / cashbox / expenses / activity — paginated list |
| `GET /shops/:shopId/:entity/:id` | Single item detail |

Every route above is `GET`-only, by construction — there is no write route
anywhere in this codebase, matching the "System 5 is read-only" requirement
at the structural level, not just as a checked permission.
