# Local full-stack dev · PixelLayer portfolio

Run the marketing site, calculator, and estimator-api together on your machine — no Stripe, Postgres, or custom domain required.

## Prerequisites

- Node 20+
- Docker (optional, for API)

## 1. Start the API

```bash
cd estimator-api
docker compose up --build
```

API listens on **http://localhost:3000** with persistent JSON storage.

Environment (already in `docker-compose.yml`):

| Variable | Local value |
|----------|-------------|
| `CORS_ORIGIN` | `http://localhost:5173,http://localhost:5174,https://pixellayer7-jpg.github.io` |
| `LIST_QUOTES_TOKEN` | Set to `dev-token` in compose for CRM admin |
| `DATA_DIR` | `/var/data` (Docker volume) |

Without Docker:

```bash
cd estimator-api
set DATA_DIR=./data
set LIST_QUOTES_TOKEN=dev-token
set CORS_ORIGIN=http://localhost:5173,http://localhost:5174
npm start
```

## 2. Frontends

Create `.env.development.local` in each repo (do not commit):

**client-landing/.env.development.local**

```env
VITE_LEAD_API_URL=http://localhost:3000
VITE_ESTIMATOR_URL=http://localhost:5174/
```

**project-estimator/.env.development.local**

```env
VITE_QUOTE_API_URL=http://localhost:3000
VITE_LEAD_API_URL=http://localhost:3000
VITE_LANDING_URL=http://localhost:5173/
VITE_SITE_URL=http://localhost:5174/
```

Terminal 1 — landing (port 5173):

```bash
cd client-landing
npm install && npm run dev
```

Terminal 2 — calculator (port 5174):

```bash
cd project-estimator
npm install && npm run dev -- --port 5174
```

## 3. CRM admin

Open **http://localhost:5174/?admin=1**, enter Bearer token `dev-token`, use **Stats | Quotes | Leads** tabs. Export JSON/CSV from the browser.

## 4. End-to-end funnel

1. Landing contact form → `POST /api/v1/leads`
2. Calculator → save quote → `POST /api/v1/quotes`
3. Handoff to landing `#contact` (same browser) **or** share `?quote=<uuid>` (cross-domain)
4. Admin → PATCH quote/lead status

## Health check

```bash
curl http://localhost:3000/health
curl http://localhost:3000/api/v1/stats
```
