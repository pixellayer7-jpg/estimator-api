# 5-minute API curl walkthrough

Interview-friendly demo of **estimator-api** with no frontend. Takes ~5 minutes after `npm start`.

Cross-platform runner (recommended on Windows):

```bash
cd estimator-api
npm start          # terminal 1 — leave running
npm run demo:curl  # terminal 2
```

Or follow the manual curls below against `http://localhost:3000`.

---

## 0. Start the API

```bash
cd estimator-api
set LIST_QUOTES_TOKEN=dev-token
npm start
```

PowerShell:

```powershell
$env:LIST_QUOTES_TOKEN = "dev-token"
npm start
```

---

## 1. Health + catalog (~30s)

```bash
curl -s http://localhost:3000/
curl -s http://localhost:3000/health
curl -s http://localhost:3000/api/v1/stats
curl -s http://localhost:3000/api/v1/openapi.json
```

Expect: `service: estimator-api`, `ok: true`, stats totals, OpenAPI `info.version`.

---

## 2. Create a quote + public share (~1 min)

```bash
curl -s -X POST http://localhost:3000/api/v1/quotes \
  -H "content-type: application/json" \
  -d "{\"projectType\":\"landing\",\"addOnIds\":[\"i18n\"],\"extraSections\":\"2\",\"min\":800,\"max\":1400,\"lang\":\"en\",\"summary\":\"Interview demo quote\"}"
```

Save the returned `id`. Then:

```bash
curl -s http://localhost:3000/api/v1/quotes/<QUOTE_ID>
```

Note `loadQuery` / `links.calculator` — that UUID is the public share surface (no Bearer).

---

## 3. List quotes (Bearer) + PATCH status (~1 min)

```bash
curl -s "http://localhost:3000/api/v1/quotes?limit=5" \
  -H "authorization: Bearer dev-token"

curl -s -X PATCH http://localhost:3000/api/v1/quotes/<QUOTE_ID> \
  -H "content-type: application/json" \
  -H "authorization: Bearer dev-token" \
  -d "{\"status\":\"sent\"}"
```

Without the token (when `LIST_QUOTES_TOKEN` is set) → **401**.

---

## 4. Lead lifecycle (~1–2 min)

```bash
curl -s -X POST http://localhost:3000/api/v1/leads \
  -H "content-type: application/json" \
  -d "{\"name\":\"Ada Interview\",\"email\":\"ada@example.com\",\"message\":\"Need a bilingual landing\",\"source\":\"landing\",\"lang\":\"en\",\"quoteRef\":\"<QUOTE_ID>\"}"

curl -s "http://localhost:3000/api/v1/leads?limit=5" \
  -H "authorization: Bearer dev-token"

curl -s -X PATCH http://localhost:3000/api/v1/leads/<LEAD_ID> \
  -H "content-type: application/json" \
  -H "authorization: Bearer dev-token" \
  -d "{\"status\":\"contacted\"}"
```

---

## 5. Stats again (~15s)

```bash
curl -s http://localhost:3000/api/v1/stats
```

Expect `totalQuotes` / `totalLeads` increased; `quotesByStatus.sent` and `leadsByStatus.contacted` populated.

---

## Talking points

| Point | Why it matters |
| --- | --- |
| Public `GET /quotes/:id` vs Bearer list/PATCH | Share links stay open; CRM stays gated |
| JSON Schema + UUID validation | Invalid bodies → 400; bad ids → 400 |
| File-backed store | Demo-ready without Postgres |
| `links.calculator` / `links.contact` | Frontend deep-links from API response |

Frontend walkthrough (no API): https://pixellayer7-jpg.github.io/1/#walkthrough

See also: [LOCAL-DEV.md](./LOCAL-DEV.md) · [README.md](../README.md)
