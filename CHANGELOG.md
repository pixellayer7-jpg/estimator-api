# Changelog

## 1.1.0

- Lead lifecycle: default `status: new`, PATCH `/api/v1/leads/:id`, GET `/api/v1/leads/:id`
- `/api/v1/stats` returns `quotesByStatus` and `leadsByStatus` breakdowns
- `docker-compose.yml` sets `LIST_QUOTES_TOKEN=dev-token` for local CRM

## 1.0.0

- `POST /api/v1/leads` — store contact form submissions (landing + calculator)
- `GET /api/v1/leads` — list recent leads (optional Bearer, same token as quotes)
- `PATCH /api/v1/quotes/:id` — update quote status (`draft` | `sent` | `accepted` | `declined`)
- `GET /api/v1/stats` — includes `totalLeads`
- Quotes created with default `status: draft`

## 0.7.1