# Changelog

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
