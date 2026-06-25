import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import buildApp from './app.js'
import * as store from './store.js'

describe('estimator-api', () => {
  let prevDir
  let dir
  let app

  before(async () => {
    prevDir = process.env.DATA_DIR
    dir = await mkdtemp(join(tmpdir(), 'estimator-api-'))
    process.env.DATA_DIR = dir
    app = await buildApp()
    await app.ready()
  })

  after(async () => {
    await app.close()
    process.env.DATA_DIR = prevDir
    await rm(dir, { recursive: true, force: true })
  })

  it('store appends and finds quote', async () => {
    const row = {
      id: '11111111-1111-4111-8111-111111111111',
      createdAt: new Date().toISOString(),
      projectType: 'landing',
      addOnIds: [],
      extraSections: '0',
      min: 800,
      max: 1200,
      lang: 'en',
      quoteRef: null,
      summary: 'test',
    }
    await store.appendQuote(row)
    const found = await store.findQuoteById(row.id)
    assert.strictEqual(found.projectType, 'landing')
  })

  it('GET /', async () => {
    const res = await app.inject({ method: 'GET', url: '/' })
    assert.strictEqual(res.statusCode, 200)
    assert.strictEqual(res.headers['x-content-type-options'], 'nosniff')
    assert.strictEqual(res.headers['x-api-version'], '0.7.0')
    const body = JSON.parse(res.body)
    assert.strictEqual(body.service, 'estimator-api')
    assert.ok(body.links?.landing)
    assert.ok(body.links?.calculator)
    assert.ok(body.endpoints?.health)
  })

  it('GET /health', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })
    assert.strictEqual(res.statusCode, 200)
    assert.strictEqual(res.headers['x-content-type-options'], 'nosniff')
    const body = JSON.parse(res.body)
    assert.strictEqual(body.ok, true)
    assert.strictEqual(body.storage, 'ready')
    assert.strictEqual(body.version, '0.7.0')
  })

  it('POST rejects oversized JSON body', async () => {
    const huge = 'x'.repeat(350_000)
    const post = await app.inject({
      method: 'POST',
      url: '/api/v1/quotes',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        projectType: 'landing',
        addOnIds: [],
        extraSections: '0',
        min: 1,
        max: 2,
        lang: 'en',
        summary: huge,
      }),
    })
    assert.strictEqual(post.statusCode, 413)
  })

  it('accepts string min/max from JSON', async () => {
    const payload = {
      projectType: 'landing',
      addOnIds: [],
      extraSections: '0',
      min: '800',
      max: '1200',
      lang: 'en',
    }
    const post = await app.inject({
      method: 'POST',
      url: '/api/v1/quotes',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify(payload),
    })
    assert.strictEqual(post.statusCode, 201)
    const created = JSON.parse(post.body)
    const get = await app.inject({
      method: 'GET',
      url: `/api/v1/quotes/${created.id}`,
    })
    const row = JSON.parse(get.body)
    assert.strictEqual(row.min, 800)
    assert.strictEqual(row.max, 1200)
  })

  it('stores numeric extraSections as string', async () => {
    const post = await app.inject({
      method: 'POST',
      url: '/api/v1/quotes',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        projectType: 'landing',
        addOnIds: [],
        extraSections: 3,
        min: 100,
        max: 200,
        lang: 'en',
      }),
    })
    assert.strictEqual(post.statusCode, 201)
    const { id } = JSON.parse(post.body)
    const get = await app.inject({ url: `/api/v1/quotes/${id}` })
    const row = JSON.parse(get.body)
    assert.strictEqual(row.extraSections, '3')
  })

  it('POST then GET quote', async () => {
    const payload = {
      projectType: 'website',
      addOnIds: ['design'],
      extraSections: '1',
      min: 2000,
      max: 3500,
      lang: 'en',
      summary: 'line1\nline2',
    }
    const post = await app.inject({
      method: 'POST',
      url: '/api/v1/quotes',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify(payload),
    })
    assert.strictEqual(post.statusCode, 201)
    const created = JSON.parse(post.body)
    assert.ok(created.id)

    const get = await app.inject({
      method: 'GET',
      url: `/api/v1/quotes/${created.id}`,
    })
    assert.strictEqual(get.statusCode, 200)
    const row = JSON.parse(get.body)
    assert.strictEqual(row.projectType, 'website')
    assert.strictEqual(row.addOnIds[0], 'design')
  })

  it('GET /api/v1/quotes lists recent rows without summary', async () => {
    await store.writeQuotes([])
    const post = await app.inject({
      method: 'POST',
      url: '/api/v1/quotes',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        projectType: 'landing',
        addOnIds: [],
        extraSections: '0',
        min: 100,
        max: 200,
        lang: 'en',
        summary: 'should-not-appear-in-list',
      }),
    })
    const { id } = JSON.parse(post.body)
    const list = await app.inject({ url: '/api/v1/quotes?limit=5' })
    assert.strictEqual(list.statusCode, 200)
    const body = JSON.parse(list.body)
    assert.strictEqual(body.count, 1)
    assert.strictEqual(body.items[0].id, id)
    assert.strictEqual(body.items[0].summary, undefined)
  })

  it('GET /api/v1/quotes requires bearer token when LIST_QUOTES_TOKEN is set', async () => {
    const prev = process.env.LIST_QUOTES_TOKEN
    process.env.LIST_QUOTES_TOKEN = 'list-secret'
    try {
      const noAuth = await app.inject({ url: '/api/v1/quotes?limit=1' })
      assert.strictEqual(noAuth.statusCode, 401)
      assert.strictEqual(noAuth.headers['www-authenticate'], 'Bearer')
      assert.deepStrictEqual(JSON.parse(noAuth.body), {
        error: 'Unauthorized',
      })

      const wrong = await app.inject({
        url: '/api/v1/quotes?limit=1',
        headers: { authorization: 'Bearer wrong-secret' },
      })
      assert.strictEqual(wrong.statusCode, 401)

      const ok = await app.inject({
        url: '/api/v1/quotes?limit=1',
        headers: { authorization: 'Bearer list-secret' },
      })
      assert.strictEqual(ok.statusCode, 200)
      assert.ok(Array.isArray(JSON.parse(ok.body).items))
    } finally {
      if (prev === undefined) delete process.env.LIST_QUOTES_TOKEN
      else process.env.LIST_QUOTES_TOKEN = prev
    }
  })

  it('unknown path returns JSON 404', async () => {
    const res = await app.inject({ url: '/does-not-exist' })
    assert.strictEqual(res.statusCode, 404)
    assert.deepStrictEqual(JSON.parse(res.body), { error: 'Not found' })
  })

  it('GET quote with invalid id returns 400', async () => {
    const res = await app.inject({ url: '/api/v1/quotes/not-a-uuid' })
    assert.strictEqual(res.statusCode, 400)
    assert.deepStrictEqual(JSON.parse(res.body), { error: 'Invalid id' })
  })

  it('POST empty JSON object returns 400 Invalid request body', async () => {
    const post = await app.inject({
      method: 'POST',
      url: '/api/v1/quotes',
      headers: { 'content-type': 'application/json' },
      payload: '{}',
    })
    assert.strictEqual(post.statusCode, 400)
    assert.deepStrictEqual(JSON.parse(post.body), {
      error: 'Invalid request body',
    })
  })

  it('POST rejects min greater than max', async () => {
    const post = await app.inject({
      method: 'POST',
      url: '/api/v1/quotes',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        projectType: 'landing',
        addOnIds: [],
        min: 500,
        max: 100,
        lang: 'en',
      }),
    })
    assert.strictEqual(post.statusCode, 400)
    assert.strictEqual(
      JSON.parse(post.body).error,
      'min must be less than or equal to max'
    )
  })

  it('POST rejects invalid lang', async () => {
    const post = await app.inject({
      method: 'POST',
      url: '/api/v1/quotes',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        projectType: 'landing',
        addOnIds: [],
        min: 1,
        max: 2,
        lang: 'fr',
      }),
    })
    assert.strictEqual(post.statusCode, 400)
    assert.strictEqual(JSON.parse(post.body).error, 'Invalid request body')
  })

  it('POST rejects invalid quoteRef', async () => {
    const post = await app.inject({
      method: 'POST',
      url: '/api/v1/quotes',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        projectType: 'landing',
        addOnIds: [],
        min: 1,
        max: 2,
        quoteRef: 'not-a-uuid',
      }),
    })
    assert.strictEqual(post.statusCode, 400)
    assert.deepStrictEqual(JSON.parse(post.body), { error: 'Invalid quoteRef' })
  })

  it('POST 201 includes loadQuery for calculator deep link', async () => {
    const post = await app.inject({
      method: 'POST',
      url: '/api/v1/quotes',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        projectType: 'landing',
        addOnIds: [],
        min: 100,
        max: 200,
        lang: 'en',
      }),
    })
    assert.strictEqual(post.statusCode, 201)
    const body = JSON.parse(post.body)
    assert.ok(body.id)
    assert.strictEqual(body.loadQuery, `?load=${body.id}`)
  })

  it('POST with empty projectType returns 400', async () => {
    const post = await app.inject({
      method: 'POST',
      url: '/api/v1/quotes',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        projectType: '',
        addOnIds: [],
        min: 1,
        max: 2,
      }),
    })
    assert.strictEqual(post.statusCode, 400)
    assert.strictEqual(JSON.parse(post.body).error, 'Invalid request body')
  })

  it('GET missing quote returns 404', async () => {
    const res = await app.inject({
      url: '/api/v1/quotes/11111111-1111-4111-8111-111111111111',
    })
    assert.strictEqual(res.statusCode, 404)
  })

  it('POST rejects unknown projectType enum', async () => {
    const post = await app.inject({
      method: 'POST',
      url: '/api/v1/quotes',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        projectType: 'invalid-type',
        addOnIds: [],
        min: 1,
        max: 2,
      }),
    })
    assert.strictEqual(post.statusCode, 400)
  })

  it('POST clamps extraSections above 20', async () => {
    const post = await app.inject({
      method: 'POST',
      url: '/api/v1/quotes',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        projectType: 'landing',
        addOnIds: [],
        extraSections: 99,
        min: 100,
        max: 200,
      }),
    })
    assert.strictEqual(post.statusCode, 201)
    const { id } = JSON.parse(post.body)
    const get = await app.inject({ url: `/api/v1/quotes/${id}` })
    assert.strictEqual(JSON.parse(get.body).extraSections, '20')
  })

  it('GET /api/v1/openapi.json returns OpenAPI spec', async () => {
    const res = await app.inject({ url: '/api/v1/openapi.json' })
    assert.strictEqual(res.statusCode, 200)
    const body = JSON.parse(res.body)
    assert.strictEqual(body.openapi, '3.0.3')
    assert.ok(body.paths['/api/v1/quotes'])
  })
})
