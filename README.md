# estimator-api

> **Portfolio highlight** · [My GitHub](https://github.com/pixellayer7-jpg) · Pairs with [project-estimator](https://github.com/pixellayer7-jpg/project-estimator)  
> Node 20 · Fastify 5 · JSON Schema · CORS · Bearer-protected list · Node test runner · CI

Minimal **Node.js + Fastify** service for **PixelLayer** to **save** calculator payloads and **fetch** them by id (step toward share links and a future auth layer).

**Live frontends:** [Landing](https://pixellayer7-jpg.github.io/1/) · [Quote calculator](https://pixellayer7-jpg.github.io/project-estimator/) (wire with `VITE_QUOTE_API_URL` + CORS when deployed).

## What it does (MVP)

| Method | Path | Description |
|--------|------|---------------|
| `GET` | `/` | Service name, version, and endpoint map (JSON) |
| `GET` | `/health` | Liveness + storage writable check; includes `version` |
| `GET` | `/api/v1/quotes?limit=20` | List recent quotes (newest first); each item omits `summary`. `limit` 1–100, default 20. Set **`LIST_QUOTES_TOKEN`** to require `Authorization: Bearer <token>` for this list endpoint in production. |
| `POST` | `/api/v1/quotes` | Save a quote snapshot (JSON body validated with JSON Schema; invalid body → **400**; `lang` must be **`en`** or **`zh`** if sent; `min` ≤ `max` (finite numbers); **`quoteRef`** must be a UUID when provided; **`extraSections`** stored as a **string**; max **256 KiB** → **413**) → returns `{ id, createdAt, path, loadQuery }` where **`loadQuery`** is `?load=<id>` for the calculator UI |
| `GET` | `/api/v1/quotes/:id` | Load one saved quote (`id` must be a UUID string; malformed ids → **400**) |

Storage is a **JSON file** under `data/quotes.json` (directory is gitignored). Good for demos and low traffic; **use PostgreSQL** (Neon, Supabase, RDS, …) when you need concurrency and backups.

Unknown paths return **`404`** with `{ "error": "Not found" }`. A well-formed UUID that is not in the store also returns **404**; a **non-UUID** `:id` on `GET /api/v1/quotes/:id` returns **400** `{ "error": "Invalid id" }`.

Responses include **`X-Content-Type-Options: nosniff`** on JSON bodies.

**Security:** see [SECURITY.md](./SECURITY.md).

## Run locally

Use **Node 20** (see **`engines`** in `package.json`; optional **`.nvmrc`** for `nvm use`).

```bash
cd estimator-api
npm install
cp .env.example .env   # optional
npm run dev            # http://localhost:3000
```

Example:

```bash
curl -s http://localhost:3000/
curl -s http://localhost:3000/health
curl -s -X POST http://localhost:3000/api/v1/quotes \
  -H "content-type: application/json" \
  -d '{"projectType":"landing","addOnIds":[],"extraSections":"0","min":800,"max":1200,"lang":"en","summary":"..."}'
curl -s "http://localhost:3000/api/v1/quotes?limit=5"
curl -s "http://localhost:3000/api/v1/quotes?limit=5" \
  -H "authorization: Bearer $LIST_QUOTES_TOKEN" # if LIST_QUOTES_TOKEN is set
```

## Environment

| Variable | Meaning |
|----------|---------|
| `PORT` | Listen port (default `3000`) |
| `HOST` | Bind address (default `0.0.0.0`) |
| `CORS_ORIGIN` | Comma-separated allowed origins; empty = allow all (**dev only**) |
| `DATA_DIR` | Override directory for `quotes.json` |
| `LIST_QUOTES_TOKEN` | Optional bearer token that protects `GET /api/v1/quotes`; leave empty for local/dev compatibility |

## Deploy (Docker / Render / Railway)

### Docker

```bash
docker build -t pixelayer-estimator-api .
docker run -p 3000:3000 -e CORS_ORIGIN=https://pixellayer7-jpg.github.io/project-estimator pixelayer-estimator-api
```

### Render (one-click blueprint)

Repo includes **`render.yaml`**. On [Render](https://render.com): **New → Blueprint** → connect this repo. Set **`CORS_ORIGIN`** to your calculator Pages URL and optional **`LIST_QUOTES_TOKEN`**.

### Wire the calculator

After deploy, add GitHub secret **`VITE_QUOTE_API_URL`** on **project-estimator** (your API HTTPS origin, no trailing slash) and re-run **Deploy to GitHub Pages**. Users can then **Save online copy** and share **`?load=<uuid>`** links.

## Deploy without your own domain

Use **Railway**, **Render**, **Fly.io**, etc.: they provide a **HTTPS subdomain**. Set `CORS_ORIGIN` to your **project-estimator** Pages URL when you wire the frontend. For production, set `LIST_QUOTES_TOKEN` so the recent-quotes list is not publicly browsable; individual quote share links (`GET /api/v1/quotes/:id`) remain public by UUID.

## Tests

```bash
npm test
```

GitHub Actions (**`.github/workflows/ci.yml`**) runs on push/PR with **`permissions: contents: read`**, **concurrency** (cancels superseded runs on the same branch), and **Node 20** (see `engines` / **`.nvmrc`**).

## Related repos

- [project-estimator](https://github.com/pixellayer7-jpg/project-estimator) — React UI (can call this API later).
- [Landing `1`](https://github.com/pixellayer7-jpg/1) — Marketing site.

## License

MIT — see [LICENSE](./LICENSE).
