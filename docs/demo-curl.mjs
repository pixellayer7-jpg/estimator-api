/**
 * 5-minute estimator-api walkthrough (Node fetch — works on Windows).
 *
 * Usage:
 *   LIST_QUOTES_TOKEN=dev-token npm start   # other terminal
 *   npm run demo:curl
 *
 * Env:
 *   API_BASE   default http://localhost:3000
 *   TOKEN      default process.env.LIST_QUOTES_TOKEN || 'dev-token'
 */

const base = (process.env.API_BASE || 'http://localhost:3000').replace(/\/+$/, '')
const token = String(process.env.TOKEN || process.env.LIST_QUOTES_TOKEN || 'dev-token')

async function req(method, path, { body, auth } = {}) {
  const headers = { accept: 'application/json' }
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (auth) headers.authorization = `Bearer ${token}`
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = text
  }
  return { status: res.status, json }
}

function step(title) {
  console.log(`\n=== ${title} ===`)
}

function ok(label, cond, detail) {
  if (!cond) {
    console.error(`FAIL: ${label}`, detail ?? '')
    process.exitCode = 1
    throw new Error(label)
  }
  console.log(`OK  ${label}`)
}

async function main() {
  console.log(`API walkthrough → ${base}`)
  console.log(`Bearer token length: ${token.length}`)

  step('1. Health + catalog')
  const root = await req('GET', '/')
  ok('GET /', root.status === 200 && root.json?.service === 'estimator-api', root)
  const health = await req('GET', '/health')
  ok('GET /health', health.status === 200 && health.json?.ok === true, health)
  const openapi = await req('GET', '/api/v1/openapi.json')
  ok('GET /openapi.json', openapi.status === 200 && openapi.json?.openapi, openapi)

  step('2. Create quote + public GET')
  const created = await req('POST', '/api/v1/quotes', {
    body: {
      projectType: 'landing',
      addOnIds: ['i18n'],
      extraSections: '2',
      min: 800,
      max: 1400,
      lang: 'en',
      summary: 'Interview demo quote',
    },
  })
  ok('POST /quotes', created.status === 201 && created.json?.id, created)
  const quoteId = created.json.id
  ok('loadQuery present', typeof created.json.loadQuery === 'string')
  ok('links.calculator present', Boolean(created.json.links?.calculator))
  const got = await req('GET', `/api/v1/quotes/${quoteId}`)
  ok('GET /quotes/:id (public)', got.status === 200 && got.json?.id === quoteId, got)

  step('3. List (Bearer) + PATCH status')
  const listUnauthorized = await req('GET', '/api/v1/quotes?limit=5')
  // When TOKEN is empty on server, list is open — only assert 401 if server requires auth.
  // We always send Bearer below; check list succeeds with auth.
  const list = await req('GET', '/api/v1/quotes?limit=5', { auth: true })
  ok('GET /quotes with Bearer', list.status === 200 && Array.isArray(list.json?.items), list)
  if (listUnauthorized.status === 401) {
    ok('list without Bearer rejected', true)
  } else {
    console.log('NOTE list without Bearer allowed (LIST_QUOTES_TOKEN empty on server)')
  }
  const patched = await req('PATCH', `/api/v1/quotes/${quoteId}`, {
    auth: true,
    body: { status: 'sent' },
  })
  ok('PATCH /quotes/:id → sent', patched.status === 200 && patched.json?.status === 'sent', patched)

  step('4. Lead lifecycle')
  const lead = await req('POST', '/api/v1/leads', {
    body: {
      name: 'Ada Interview',
      email: 'ada@example.com',
      message: 'Need a bilingual landing',
      source: 'landing',
      lang: 'en',
      quoteRef: quoteId,
    },
  })
  ok('POST /leads', lead.status === 201 && lead.json?.id, lead)
  const leadId = lead.json.id
  const leads = await req('GET', '/api/v1/leads?limit=5', { auth: true })
  ok('GET /leads with Bearer', leads.status === 200 && Array.isArray(leads.json?.items), leads)
  const leadPatched = await req('PATCH', `/api/v1/leads/${leadId}`, {
    auth: true,
    body: { status: 'contacted' },
  })
  ok(
    'PATCH /leads/:id → contacted',
    leadPatched.status === 200 && leadPatched.json?.status === 'contacted',
    leadPatched
  )

  step('5. Stats')
  const stats = await req('GET', '/api/v1/stats')
  ok('GET /stats', stats.status === 200 && typeof stats.json?.totalQuotes === 'number', stats)
  console.log('stats →', JSON.stringify(stats.json))

  console.log('\nWalkthrough complete.')
  console.log(`Quote id: ${quoteId}`)
  console.log(`Lead id:  ${leadId}`)
  console.log('Frontend: https://pixellayer7-jpg.github.io/1/#walkthrough')
}

main().catch((err) => {
  console.error('\nWalkthrough failed:', err.message || err)
  console.error('Is the API running? Try: LIST_QUOTES_TOKEN=dev-token npm start')
  process.exitCode = 1
})
