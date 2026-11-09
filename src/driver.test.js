import { describe, it, after } from 'node:test'
import assert from 'node:assert'
import { getStorageDriver, usePostgres } from './driver.js'
import { _quotesImplForTests } from './store.js'
import { _leadsImplForTests } from './leadsStore.js'
import * as sqliteStore from './sqliteStore.js'
import * as pgStore from './pgStore.js'
import * as sqliteLeads from './sqliteLeadsStore.js'
import * as pgLeads from './pgLeadsStore.js'
import { closeStorage } from './db.js'

describe('driver', () => {
  after(async () => {
    delete process.env.DATABASE_URL
    await closeStorage()
  })

  it('defaults to sqlite and switches to postgres when DATABASE_URL is set', async () => {
    delete process.env.DATABASE_URL
    assert.strictEqual(usePostgres(), false)
    assert.strictEqual(getStorageDriver(), 'sqlite')
    assert.strictEqual(_quotesImplForTests(), sqliteStore)
    assert.strictEqual(_leadsImplForTests(), sqliteLeads)

    process.env.DATABASE_URL =
      'postgres://estimator:estimator@127.0.0.1:5432/estimator'
    assert.strictEqual(usePostgres(), true)
    assert.strictEqual(getStorageDriver(), 'postgres')
    assert.strictEqual(_quotesImplForTests(), pgStore)
    assert.strictEqual(_leadsImplForTests(), pgLeads)

    delete process.env.DATABASE_URL
    assert.strictEqual(getStorageDriver(), 'sqlite')
    await closeStorage()
  })
})
