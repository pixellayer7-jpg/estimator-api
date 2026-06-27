# Changelog

## 1.0.0

- `POST /api/v1/leads` — store contact form submissions (landing + calculator)
- `GET /api/v1/leads` — list recent leads (optional Bearer, same token as quotes)
- `PATCH /api/v1/quotes/:id` — update quote status (`draft` | `sent` | `accepted` | `declined`)
- `GET /api/v1/stats` — includes `totalLeads`
- Quotes created with default `status: draft`

## 0.7.1