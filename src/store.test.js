import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as store from './store.js'
import * as leadsStore from './leadsStore.js'

describe('store', () => {
  let prevDir
  let dir

  before(async () => {
    prevDir = process.env.DATA_DIR
    dir = await mkdtemp(join(tmpdir(), 'estimator-store-'))
    process.env.DATA_DIR = dir
  })

  after(async () => {
    process.env.DATA_DIR = prevDir
    await rm(dir, { recursive: true, force: true })
  })

  it('appendQuote writes valid JSON file', async () => {
    const row = {
      id: '22222222-2222-4222-8222-222222222222',
      createdAt: new Date().toISOString(),
      projectType: 'landing',
      addOnIds: [],
      extraSections: '0',
      min: 1,
      max: 2,
      lang: 'en',
      quoteRef: null,
      summary: null,
    }
    await store.appendQuote(row)
    const found = await store.findQuoteById(row.id)
    assert.strictEqual(found.id, row.id)
    const raw = await readFile(join(dir, 'quotes.json'), 'utf8')
    assert.doesNotThrow(() => JSON.parse(raw))
  })

  it('checkStorageReady succeeds on writable dir', async () => {
    await assert.doesNotReject(() => store.checkStorageReady())
  })

  it('readQuotes returns [] for a non-array file and throws on corrupt JSON', async () => {
    await writeFile(join(dir, 'quotes.json'), '{}', 'utf8')
    assert.deepStrictEqual(await store.readQuotes(), [])
    await writeFile(join(dir, 'quotes.json'), '{broken', 'utf8')
    await assert.rejects(() => store.readQuotes())
  })

  it('quoteStatusBreakdown buckets unknown statuses as draft', async () => {
    await writeFile(
      join(dir, 'quotes.json'),
      JSON.stringify([
        {
          id: '33333333-3333-4333-8333-333333333333',
          createdAt: new Date().toISOString(),
          projectType: 'landing',
          status: 'mystery',
        },
      ]),
      'utf8'
    )
    const counts = await store.quoteStatusBreakdown()
    assert.strictEqual(counts.draft, 1)
  })

  it('updateQuoteById returns null for a missing id', async () => {
    const updated = await store.updateQuoteById(
      '44444444-4444-4444-8444-444444444444',
      { status: 'sent' }
    )
    assert.strictEqual(updated, null)
  })

  it('appendQuote trims when the store is already at the max', async () => {
    const many = Array.from({ length: 10_000 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      createdAt: '2026-01-01T00:00:00.000Z',
      projectType: 'landing',
      addOnIds: [],
      extraSections: '0',
      min: 1,
      max: 2,
      lang: 'en',
      status: 'draft',
    }))
    await writeFile(join(dir, 'quotes.json'), JSON.stringify(many), 'utf8')
    const newest = {
      id: '55555555-5555-4555-8555-555555555555',
      createdAt: new Date().toISOString(),
      projectType: 'website',
      addOnIds: [],
      extraSections: '0',
      min: 3,
      max: 4,
      lang: 'zh',
      status: 'sent',
    }
    await store.appendQuote(newest)
    const quotes = await store.readQuotes()
    assert.strictEqual(quotes.length, 10_000)
    assert.strictEqual(quotes[quotes.length - 1].id, newest.id)
    assert.strictEqual(quotes[0].id, many[1].id)
  })

  it('readLeads returns [] for a non-array file and throws on corrupt JSON', async () => {
    await writeFile(join(dir, 'leads.json'), 'null', 'utf8')
    assert.deepStrictEqual(await leadsStore.readLeads(), [])
    await writeFile(join(dir, 'leads.json'), '{broken', 'utf8')
    await assert.rejects(() => leadsStore.readLeads())
  })

  it('leadStatusBreakdown buckets unknown statuses as new', async () => {
    await writeFile(
      join(dir, 'leads.json'),
      JSON.stringify([
        {
          id: '66666666-6666-4666-8666-666666666666',
          createdAt: new Date().toISOString(),
          name: 'A',
          email: 'a@example.com',
          status: 'weird',
        },
      ]),
      'utf8'
    )
    const counts = await leadsStore.leadStatusBreakdown()
    assert.strictEqual(counts.new, 1)
  })

  it('updateLeadById returns null for a missing id', async () => {
    const updated = await leadsStore.updateLeadById(
      '77777777-7777-4777-8777-777777777777',
      { status: 'closed' }
    )
    assert.strictEqual(updated, null)
  })

  it('appendLead trims when the store is already at the max', async () => {
    const many = Array.from({ length: 10_000 }, (_, i) => ({
      id: `10000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      createdAt: '2026-01-01T00:00:00.000Z',
      name: 'N',
      email: 'n@example.com',
      message: 'm',
      status: 'new',
    }))
    await writeFile(join(dir, 'leads.json'), JSON.stringify(many), 'utf8')
    const newest = {
      id: '88888888-8888-4888-8888-888888888888',
      createdAt: new Date().toISOString(),
      name: 'Newest',
      email: 'newest@example.com',
      message: 'kept',
      status: 'qualified',
    }
    await leadsStore.appendLead(newest)
    const leads = await leadsStore.readLeads()
    assert.strictEqual(leads.length, 10_000)
    assert.strictEqual(leads[leads.length - 1].id, newest.id)
    assert.strictEqual(leads[0].id, many[1].id)
  })
})
