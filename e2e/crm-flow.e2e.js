import { test, expect } from '@playwright/test'
import { E2E_TOKEN } from './constants.js'

test.describe.configure({ mode: 'serial' })

test.describe('CRM API flow (real HTTP)', () => {
  let quoteId
  let leadId

  test('health reports sqlite driver', async ({ request }) => {
    const res = await request.get('/health')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.storage).toBe('ready')
    expect(body.storageDriver).toBe('sqlite')
    expect(res.headers()['x-api-version']).toBeTruthy()
  })

  test('POST quote then public GET by id', async ({ request }) => {
    const post = await request.post('/api/v1/quotes', {
      data: {
        projectType: 'landing',
        addOnIds: ['i18n'],
        extraSections: '2',
        min: 800,
        max: 1400,
        lang: 'en',
        summary: 'Playwright e2e quote',
      },
    })
    expect(post.status()).toBe(201)
    const created = await post.json()
    expect(created.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    )
    expect(created.links?.calculator).toContain('load=')
    quoteId = created.id

    const get = await request.get(`/api/v1/quotes/${quoteId}`)
    expect(get.status()).toBe(200)
    const quote = await get.json()
    expect(quote.projectType).toBe('landing')
    expect(quote.addOnIds).toEqual(['i18n'])
    expect(quote.status).toBe('draft')
  })

  test('POST lead linked to quote', async ({ request }) => {
    const post = await request.post('/api/v1/leads', {
      data: {
        name: 'E2E Lead',
        email: 'e2e@example.com',
        message: 'Need a landing page',
        source: 'calculator',
        lang: 'en',
        quoteRef: quoteId,
      },
    })
    expect(post.status()).toBe(201)
    const created = await post.json()
    leadId = created.id
    expect(leadId).toBeTruthy()
  })

  test('PATCH quote and lead status with Bearer', async ({ request }) => {
    const auth = { Authorization: `Bearer ${E2E_TOKEN}` }

    const q = await request.patch(`/api/v1/quotes/${quoteId}`, {
      headers: auth,
      data: { status: 'sent', notes: 'E2E follow-up' },
    })
    expect(q.status()).toBe(200)
    const qBody = await q.json()
    expect(qBody.status).toBe('sent')
    expect(qBody.notes).toBe('E2E follow-up')

    const l = await request.patch(`/api/v1/leads/${leadId}`, {
      headers: auth,
      data: { status: 'contacted', notes: 'Called once' },
    })
    expect(l.status()).toBe(200)
    const lBody = await l.json()
    expect(lBody.status).toBe('contacted')
    expect(lBody.notes).toBe('Called once')
  })

  test('list + stats require/reflect CRM state', async ({ request }) => {
    const denied = await request.get('/api/v1/quotes?limit=5')
    expect(denied.status()).toBe(401)

    const list = await request.get('/api/v1/quotes?limit=5', {
      headers: { Authorization: `Bearer ${E2E_TOKEN}` },
    })
    expect(list.status()).toBe(200)
    const body = await list.json()
    expect(body.count).toBeGreaterThanOrEqual(1)
    expect(body.total).toBeGreaterThanOrEqual(1)
    expect(body.items.some((i) => i.id === quoteId)).toBe(true)

    const filtered = await request.get('/api/v1/quotes?status=sent&limit=20', {
      headers: { Authorization: `Bearer ${E2E_TOKEN}` },
    })
    expect(filtered.status()).toBe(200)
    const sentPage = await filtered.json()
    expect(sentPage.status).toBe('sent')
    expect(sentPage.items.every((i) => i.status === 'sent')).toBe(true)
    expect(sentPage.items.some((i) => i.id === quoteId)).toBe(true)

    const searched = await request.get(
      `/api/v1/quotes?q=${encodeURIComponent(quoteId.slice(0, 8))}`,
      { headers: { Authorization: `Bearer ${E2E_TOKEN}` } }
    )
    expect(searched.status()).toBe(200)
    const searchPage = await searched.json()
    expect(searchPage.q).toBe(quoteId.slice(0, 8))
    expect(searchPage.items.some((i) => i.id === quoteId)).toBe(true)

    const leadSearch = await request.get('/api/v1/leads?q=e2e', {
      headers: { Authorization: `Bearer ${E2E_TOKEN}` },
    })
    expect(leadSearch.status()).toBe(200)

    const audit = await request.get('/api/v1/audit?limit=20', {
      headers: { Authorization: `Bearer ${E2E_TOKEN}` },
    })
    expect(audit.status()).toBe(200)
    const auditBody = await audit.json()
    expect(auditBody.items.some((e) => e.action === 'quote.patch')).toBe(true)
    expect(auditBody.items.some((e) => e.action === 'lead.patch')).toBe(true)

    const stats = await request.get('/api/v1/stats')
    expect(stats.status()).toBe(200)
    const s = await stats.json()
    expect(s.totalQuotes).toBeGreaterThanOrEqual(1)
    expect(s.totalLeads).toBeGreaterThanOrEqual(1)
    expect(s.quotesByStatus.sent).toBeGreaterThanOrEqual(1)
    expect(s.leadsByStatus.contacted).toBeGreaterThanOrEqual(1)
  })

  test('GET backup is Bearer-gated SQLite snapshot', async ({ request }) => {
    const noAuth = await request.get('/api/v1/backup')
    expect(noAuth.status()).toBe(401)

    const ok = await request.get('/api/v1/backup', {
      headers: { Authorization: `Bearer ${E2E_TOKEN}` },
    })
    expect(ok.status()).toBe(200)
    expect(ok.headers()['content-type']).toContain('application/vnd.sqlite3')
    expect(ok.headers()['content-disposition'] || '').toMatch(
      /attachment; filename="estimator-backup-/
    )
    const buf = Buffer.from(await ok.body())
    expect(buf.subarray(0, 15).toString('utf8')).toBe('SQLite format 3')
  })
})
