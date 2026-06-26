# Changelog

## 0.7.1

- `GET /api/v1/stats` — `{ totalQuotes, version }` for lightweight monitoring

## 0.7.0

- POST `/api/v1/quotes` rate limit: 30 requests / minute per IP
- GET `/api/v1/openapi.json` — minimal OpenAPI 3 spec
- `docker-compose.yml` for local dev with persistent volume

## 0.6.2

- `GET /` includes `links` to live landing and calculator demos
- All JSON responses include `X-API-Version` header

## 0.6.1

- `/health` response includes API `version` (success and failure)

## 0.6.0

- Atomic quote file writes and serialized append (fewer lost writes under concurrency)
- Deep `/health` checks storage is writable; returns 503 when not ready
- Tighter POST schema: `projectType` / `addOnIds` enums, `extraSections` clamped 0–20
- Graceful shutdown on SIGTERM/SIGINT
- Render blueprint: persistent disk at `/var/data`
- Docker: non-root user, `HEALTHCHECK`, default `DATA_DIR`
- Cap store at 10,000 quotes (oldest trimmed)

## 0.5.0

- Docker + Render deploy docs, JSON Schema validation, Bearer list auth
