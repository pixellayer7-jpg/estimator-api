# estimator-api

> **Portfolio highlight** · [My GitHub](https://github.com/pixellayer7-jpg) · Pairs with [project-estimator](https://github.com/pixellayer7-jpg/project-estimator)  
> Node 20 · Fastify 5 · JSON Schema · CORS · Bearer-protected list · Node test runner · CI

Minimal **Node.js + Fastify** service for **PixelLayer** to **save** calculator payloads, **leads**, and **CRM status** — shareable `?load=<uuid>` links plus an optional online CRM.

**Live frontends:** [Landing](https://pixellayer7-jpg.github.io/1/) · [Quote calculator](https://pixellayer7-jpg.github.io/project-estimator/) · [CRM admin](https://pixellayer7-jpg.github.io/project-estimator/?admin=1) (wire with `VITE_QUOTE_API_URL` / `VITE_LEAD_API_URL` + CORS when deployed).

## What it does (v1.1.1)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/` | — | Service name, version, and endpoint map (JSON) |
| `GET` | `/health` | — | Liveness + storage writable check; includes `version` |
| `GET` | `/api/v1/openapi.json` | — | Lightweight OpenAPI 3.0 path map (for interview demos) |
| `GET` | `/api/v1/stats` | — | `{ totalQuotes, totalLeads, quotesByStatus, leadsByStatus, version }` |
| `GET` | `/api/v1/quotes?limit=20` | Bearer if token set | List recent quotes (newest first); items omit `summary`. `limit` 1–100, default 20 |
| `POST` | `/api/v1/quotes` | — | Save quote snapshot (JSON Schema). Returns `{ id, createdAt, path, loadQuery, links }` with `links.calculator` / `links.contact` |
| `GET` | `/api/v1/quotes/:id` | — | Load one saved quote (UUID). Public share link |
| `PATCH` | `/api/v1/quotes/:id` | Bearer if token set | Update quote `status`: `draft` \| `sent` \| `accepted` \| `declined` |
| `GET` | `/api/v1/leads?limit=20` | Bearer if token set | List recent contact leads |
| `POST` | `/api/v1/leads` | — | Store contact lead (`name`, `email`, `message` required; optional `subject`, `projectType`, `timeline`, `quoteRef`, `source`, `lang`). Default `status: new` |
| `GET` | `/api/v1/leads/:id` | Bearer if token set | Load one lead by UUID |
| `PATCH` | `/api/v1/leads/:id` | Bearer if token set | Update lead `status`: `new` \| `contacted` \| `qualified` \| `closed` |

**Auth note:** When **`LIST_QUOTES_TOKEN`** is set, protected routes require `Authorization: Bearer <token>`. Single-quote `GET /api/v1/quotes/:id` stays public for share links. Leave the token empty for local/dev.

**Validation highlights (quotes):** invalid body → **400**; `lang` must be **`en`** or **`zh`** if sent; `min` ≤ `max` (finite); **`quoteRef`** must be a UUID when provided; **`extraSections`** stored as a **string** (0–20); body max **256 KiB** → **413**. New quotes default to `status: draft`.

**Leads:** `source` is `landing` \| `calculator` (default `landing`). Rate limits: quotes POST 30/min, leads POST 20/min (global 100/min).

Storage is **JSON files** under `data/` (`quotes.json`, leads store — directory gitignored). Good for demos; use PostgreSQL when you need concurrency and backups.

Unknown paths return **`404`** `{ "error": "Not found" }`. Non-UUID `:id` → **400** `{ "error": "Invalid id" }`.

Responses include **`X-Content-Type-Options: nosniff`** and **`X-API-Version`**.

**Security:** see [SECURITY.md](./SECURITY.md). Changelog: [CHANGELOG.md](./CHANGELOG.md).

## Run locally

Use **Node 20** (see **`engines`** in `package.json`; optional **`.nvmrc`** for `nvm use`).

```bash
cd estimator-api
npm install
cp .env.example .env   # optional
npm run dev            # http://localhost:3000
```

**Local CRM compose:** see [docs/LOCAL-DEV.md](./docs/LOCAL-DEV.md) (`docker-compose.yml` sets `LIST_QUOTES_TOKEN=dev-token`).

Example:

```bash
curl -s http://localhost:3000/
curl -s http://localhost:3000/health
curl -s http://localhost:3000/api/v1/stats
curl -s http://localhost:3000/api/v1/openapi.json
curl -s -X POST http://localhost:3000/api/v1/quotes \
  -H "content-type: application/json" \
  -d '{"projectType":"landing","addOnIds":[],"extraSections":"0","min":800,"max":1200,"lang":"en","summary":"..."}'
curl -s "http://localhost:3000/api/v1/quotes?limit=5" \
  -H "authorization: Bearer $LIST_QUOTES_TOKEN" # if LIST_QUOTES_TOKEN is set
curl -s -X POST http://localhost:3000/api/v1/leads \
  -H "content-type: application/json" \
  -d '{"name":"Ada","email":"ada@example.com","message":"Need a landing page","source":"landing","lang":"en"}'
curl -s -X PATCH http://localhost:3000/api/v1/leads/<uuid> \
  -H "content-type: application/json" \
  -H "authorization: Bearer $LIST_QUOTES_TOKEN" \
  -d '{"status":"contacted"}'
```

## Environment

| Variable | Meaning |
|----------|---------|
| `PORT` | Listen port (default `3000`) |
| `HOST` | Bind address (default `0.0.0.0`) |
| `CORS_ORIGIN` | Comma-separated allowed origins; empty = allow all (**dev only**) |
| `DATA_DIR` | Override directory for JSON stores |
| `LIST_QUOTES_TOKEN` | Optional bearer for list / PATCH / get-lead routes |
| `FRONTEND_CALCULATOR_URL` | Base URL for `links.calculator` in POST quote responses |
| `FRONTEND_LANDING_URL` | Base URL for `links.contact` (`?quote=<id>#contact`) |

## Deploy (Docker / Render / Railway)

### Docker

```bash
docker build -t pixelayer-estimator-api .
docker run -p 3000:3000 \
  -e CORS_ORIGIN=https://pixellayer7-jpg.github.io/project-estimator,https://pixellayer7-jpg.github.io/1 \
  -e LIST_QUOTES_TOKEN=change-me \
  pixelayer-estimator-api
```

### Render (one-click blueprint)

Repo includes **`render.yaml`**. On [Render](https://render.com): **New → Blueprint** → connect this repo. Set **`CORS_ORIGIN`** to your calculator + landing Pages URLs and optional **`LIST_QUOTES_TOKEN`**.

### Wire the frontends

After deploy:

1. GitHub secret **`VITE_QUOTE_API_URL`** on **project-estimator** (API HTTPS origin, no trailing slash) → re-run Pages deploy → **Save online copy** + `?load=<uuid>`.
2. Optional **`VITE_LEAD_API_URL`** on **project-estimator** and **`1`** for contact → `POST /api/v1/leads`.

## Deploy without your own domain

Use **Railway**, **Render**, **Fly.io**, etc.: HTTPS subdomain. Set `CORS_ORIGIN` to your Pages origins. For production, set `LIST_QUOTES_TOKEN` so quote/lead lists and status patches are not public; individual quote share links remain public by UUID.

## Tests

```bash
npm test
```

GitHub Actions (**`.github/workflows/ci.yml`**) runs on push/PR with **`permissions: contents: read`**, **concurrency**, and **Node 20**.

## Related repos

- [project-estimator](https://github.com/pixellayer7-jpg/project-estimator) — React calculator / CRM / proposal / portal
- [Landing `1`](https://github.com/pixellayer7-jpg/1) — Marketing site + `#walkthrough`
- [rongen-church](https://github.com/pixellayer7-jpg/rongen-church) — Client WordPress theme preview

## License

MIT — see [LICENSE](./LICENSE).
