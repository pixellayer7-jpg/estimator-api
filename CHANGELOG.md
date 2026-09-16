# Changelog

## 1.1.2

- OpenAPI: richer `/api/v1/openapi.json` with request examples, response samples, Bearer security scheme, tags, and servers
- Interview-friendly schemas for QuoteCreate / LeadCreate / status PATCH

## 1.1.1

- Docs: README endpoint table now covers leads, PATCH status, stats, OpenAPI, and share `links`
- Docs: 5-minute curl walkthrough (`docs/CURL-WALKTHROUGH.md`) + `npm run demo:curl`
- `POST /api/v1/quotes` response includes `links.calculator` and `links.contact` share URLs
- Configure via `FRONTEND_CALCULATOR_URL` and `FRONTEND_LANDING_URL`

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