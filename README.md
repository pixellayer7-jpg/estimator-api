# estimator-api

Minimal **Node.js + Fastify** service for **PixelLayer** to **save** calculator payloads and **fetch** them by id (step toward share links and a future auth layer).

## What it does (MVP)

| Method | Path | Description |
|--------|------|---------------|
| `GET` | `/` | Service name, version, and endpoint map (JSON) |
| `GET` | `/health` | Liveness check |
| `GET` | `/api/v1/quotes?limit=20` | List recent quotes (newest first); each item omits `summary`. `limit` 1–100, default 20. **Unauthenticated** — protect or remove in production. |
| `POST` | `/api/v1/quotes` | Save a quote snapshot (JSON body) → returns `{ id, createdAt, path }` |
| `GET` | `/api/v1/quotes/:id` | Load one saved quote |

Storage is a **JSON file** under `data/quotes.json` (directory is gitignored). Good for demos and low traffic; **use PostgreSQL** (Neon, Supabase, RDS, …) when you need concurrency and backups.

Unknown paths return **`404`** with `{ "error": "Not found" }`.

## Run locally

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
```

## Environment

| Variable | Meaning |
|----------|---------|
| `PORT` | Listen port (default `3000`) |
| `HOST` | Bind address (default `0.0.0.0`) |
| `CORS_ORIGIN` | Comma-separated allowed origins; empty = allow all (**dev only**) |
| `DATA_DIR` | Override directory for `quotes.json` |

## Deploy without your own domain

Use **Railway**, **Render**, **Fly.io**, etc.: they provide a **HTTPS subdomain**. Set `CORS_ORIGIN` to your **project-estimator** Pages URL when you wire the frontend.

## Tests

```bash
npm test
```

## Related repos

- [project-estimator](https://github.com/pixellayer7-jpg/project-estimator) — React UI (can call this API later).
- [Landing `1`](https://github.com/pixellayer7-jpg/1) — Marketing site.

## License

MIT — see [LICENSE](./LICENSE).
