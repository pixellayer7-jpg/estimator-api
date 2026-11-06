import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeDb, getSqlitePath } from './db.js'
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

  beforeEach(() => {
    closeDb()
  })

  after(async () => {
    closeDb()
    process.env.DATA_DIR = prevDir
    await rm(dir, { recursive: true, force: true })
  })

  it('appendQuote writes a row into SQLite', async () => {
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
    assert.ok(existsSync(getSqlitePath()))
  })

  it('checkStorageReady succeeds on writable dir', async () => {
    await assert.doesNotReject(() => store.checkStorageReady())
  })

  it('quoteStatusBreakdown buckets unknown statuses as draft', async () => {
    await store.writeQuotes([
      {
        id: '33333333-3333-4333-8333-333333333333',
        createdAt: new Date().toISOString(),
        projectType: 'landing',
        addOnIds: [],
        extraSections: '0',
        min: 1,
        max: 2,
        status: 'mystery',
      },
    ])
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
    await store.writeQuotes(many)
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

  it('leadStatusBreakdown buckets unknown statuses as new', async () => {
    await leadsStore.writeLeads([
      {
        id: '66666666-6666-4666-8666-666666666666',
        createdAt: new Date().toISOString(),
        name: 'A',
        email: 'a@example.com',
        message: 'hi',
        status: 'weird',
      },
    ])
    const counts = await leadsStore.leadStatusBreakdown()
    assert.strictEqual(counts.new, 1)
  })

  it('maps lead optional fields and list/limit edge cases', async () => {
    const full = {
      id: '12121212-1212-4121-8121-121212121212',
      createdAt: new Date().toISOString(),
      name: 'Full',
      email: 'full@example.com',
      message: 'msg',
      subject: 'subj',
      projectType: 'landing',
      timeline: 'asap',
      quoteRef: 'Q-1',
      source: 'web',
      lang: 'en',
      status: 'contacted',
    }
    await leadsStore.appendLead(full)
    const found = await leadsStore.findLeadById(full.id)
    assert.strictEqual(found.subject, 'subj')
    assert.strictEqual(found.quoteRef, 'Q-1')

    await leadsStore.updateLeadById(full.id, {
      status: '',
      subject: undefined,
    })
    const after = await leadsStore.findLeadById(full.id)
    assert.strictEqual(after.status, 'new')

    assert.ok((await leadsStore.listLeadsRecent(Number.NaN)).length >= 1)
    assert.ok((await leadsStore.listLeadsRecent(0)).length >= 1)
    assert.ok((await leadsStore.listLeadsRecent(1000)).length >= 1)
    assert.ok((await store.listQuotesRecent(Number.NaN)).length >= 0)
    assert.strictEqual(await leadsStore.findLeadById('no-such-lead'), null)
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
    await leadsStore.writeLeads(many)
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

  it('returns [] for corrupt add_on_ids JSON and rolls back duplicate inserts', async () => {
    const { getDb } = await import('./db.js')
    const db = getDb()
    const insert = db.prepare(`
      INSERT INTO quotes (
        id, created_at, project_type, add_on_ids, extra_sections,
        min, max, lang, quote_ref, summary, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    insert.run(
      '99999999-9999-4999-8999-999999999999',
      '2026-01-01T00:00:00.000Z',
      'landing',
      '{not-json',
      '0',
      1,
      2,
      'en',
      null,
      null,
      'draft'
    )
    insert.run(
      '88888888-8888-4888-8888-888888888888',
      '2026-01-01T00:00:00.000Z',
      'landing',
      '"not-an-array"',
      '0',
      1,
      2,
      'en',
      null,
      null,
      ''
    )
    assert.deepStrictEqual(
      (await store.findQuoteById('99999999-9999-4999-8999-999999999999'))
        .addOnIds,
      []
    )
    const nonArray = await store.findQuoteById(
      '88888888-8888-4888-8888-888888888888'
    )
    assert.deepStrictEqual(nonArray.addOnIds, [])
    assert.strictEqual(nonArray.status, 'draft')

    const row = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      createdAt: new Date().toISOString(),
      projectType: 'landing',
      addOnIds: 'design',
      extraSections: '0',
      min: 1,
      max: 2,
      lang: 'en',
    }
    await store.appendQuote(row)
    await assert.rejects(() => store.appendQuote(row))
    await assert.rejects(() =>
      store.writeQuotes([{ createdAt: 'x', projectType: 'landing' }])
    )
    await store.writeQuotes([
      {
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        createdAt: new Date().toISOString(),
        projectType: 'landing',
        addOnIds: null,
        min: 1,
        max: 2,
      },
    ])

    const lead = {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      createdAt: new Date().toISOString(),
      name: 'Dup',
      email: 'dup@example.com',
      message: 'm',
      status: 'new',
    }
    await leadsStore.appendLead(lead)
    await assert.rejects(() => leadsStore.appendLead(lead))
    await assert.rejects(() =>
      leadsStore.writeLeads([{ createdAt: 'x', name: 'A', email: 'a@b.c' }])
    )
  })

  it('imports legacy quotes.json and leads.json once into SQLite', async () => {
    closeDb()
    const legacyDir = await mkdtemp(join(tmpdir(), 'estimator-legacy-'))
    const prev = process.env.DATA_DIR
    process.env.DATA_DIR = legacyDir
    try {
      await writeFile(
        join(legacyDir, 'quotes.json'),
        JSON.stringify([
          {
            id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
            createdAt: '2026-01-02T00:00:00.000Z',
            projectType: 'website',
            addOnIds: ['i18n'],
            extraSections: '2',
            min: 10,
            max: 20,
            lang: 'en',
            status: 'sent',
            summary: 'legacy',
          },
        ]),
        'utf8'
      )
      await writeFile(
        join(legacyDir, 'leads.json'),
        JSON.stringify([
          {
            id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            createdAt: '2026-01-03T00:00:00.000Z',
            name: 'Legacy',
            email: 'legacy@example.com',
            message: 'hi',
            status: 'new',
          },
        ]),
        'utf8'
      )
      const quote = await store.findQuoteById(
        'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
      )
      assert.strictEqual(quote.projectType, 'website')
      assert.deepStrictEqual(quote.addOnIds, ['i18n'])
      const lead = await leadsStore.findLeadById(
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
      )
      assert.strictEqual(lead.email, 'legacy@example.com')
      assert.ok(existsSync(join(legacyDir, 'quotes.json.migrated')))
      assert.ok(existsSync(join(legacyDir, 'leads.json.migrated')))
      await assert.rejects(() =>
        readFile(join(legacyDir, 'quotes.json'), 'utf8')
      )
    } finally {
      closeDb()
      process.env.DATA_DIR = prev
      await rm(legacyDir, { recursive: true, force: true })
    }
  })
})
