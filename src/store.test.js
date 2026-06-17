import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as store from './store.js'

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
})
