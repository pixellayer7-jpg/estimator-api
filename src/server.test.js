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

  it('GET /health', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })
    assert.strictEqual(res.statusCode, 200)
    const body = JSON.parse(res.body)
    assert.strictEqual(body.ok, true)
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
})
