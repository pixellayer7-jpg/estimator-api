/**
 * Optional Postgres smoke test. Skips unless DATABASE_URL is set.
 * Example: docker compose --profile postgres up -d db
 *          $env:DATABASE_URL='postgres://estimator:estimator@127.0.0.1:5432/estimator'
 *          npm test
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { usePostgres } from './driver.js'
import { closeStorage } from './db.js'
import * as store from './store.js'
import * as leadsStore from './leadsStore.js'
import { migrate } from './pg.js'

const enabled = Boolean(String(process.env.DATABASE_URL || '').trim())

describe('postgres integration', { skip: !enabled }, () => {
  before(async () => {
    assert.ok(usePostgres())
    await migrate()
    await store.writeQuotes([])
    await leadsStore.writeLeads([])
  })

  after(async () => {
    await closeStorage()
  })

  it('round-trips a quote and lead', async () => {
    const quote = {
      id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      createdAt: new Date().toISOString(),
      projectType: 'landing',
      addOnIds: ['i18n'],
      extraSections: '1',
      min: 10,
      max: 20,
      lang: 'en',
      status: 'draft',
    }
    await store.appendQuote(quote)
    const found = await store.findQuoteById(quote.id)
    assert.strictEqual(found.projectType, 'landing')
    assert.deepStrictEqual(found.addOnIds, ['i18n'])

    const lead = {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      createdAt: new Date().toISOString(),
      name: 'Pg',
      email: 'pg@example.com',
      message: 'hi',
      status: 'new',
    }
    await leadsStore.appendLead(lead)
    assert.strictEqual(
      (await leadsStore.findLeadById(lead.id)).email,
      'pg@example.com'
    )
    assert.ok((await store.countQuotes()) >= 1)
    assert.ok((await leadsStore.countLeads()) >= 1)
    await store.checkStorageReady()
  })
})
