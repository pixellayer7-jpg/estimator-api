import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { closeDb, getDataDir, getDb, getSqlitePath } from './db.js'
import * as store from './store.js'

const SAMPLE_QUOTE = {
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  createdAt: '2026-01-01T00:00:00.000Z',
  projectType: 'landing',
  addOnIds: [],
  min: 1,
  max: 2,
  lang: 'en',
  status: 'draft',
}

describe('db', () => {
  let prevDir
  let dir

  before(async () => {
    prevDir = process.env.DATA_DIR
    dir = await mkdtemp(join(tmpdir(), 'estimator-db-'))
    process.env.DATA_DIR = dir
  })

  after(async () => {
    closeDb()
    process.env.DATA_DIR = prevDir
    await rm(dir, { recursive: true, force: true })
  })

  it('reopens when DATA_DIR changes and exposes path helpers', async () => {
    closeDb()
    const first = getDb()
    assert.ok(first)
    assert.ok(getSqlitePath().endsWith('estimator.sqlite'))
    assert.strictEqual(getDataDir(), dir)

    const other = await mkdtemp(join(tmpdir(), 'estimator-db-b-'))
    process.env.DATA_DIR = other
    const second = getDb()
    assert.notStrictEqual(getSqlitePath(), join(dir, 'estimator.sqlite'))
    assert.ok(second)
    closeDb()
    process.env.DATA_DIR = dir
    await rm(other, { recursive: true, force: true })
  })

  it('skips a broken legacy quotes.json during import', async () => {
    closeDb()
    const legacyDir = await mkdtemp(join(tmpdir(), 'estimator-broken-'))
    const prev = process.env.DATA_DIR
    process.env.DATA_DIR = legacyDir
    try {
      await writeFile(join(legacyDir, 'quotes.json'), '{broken', 'utf8')
      await writeFile(join(legacyDir, 'leads.json'), 'null', 'utf8')
      getDb()
      assert.strictEqual(await store.countQuotes(), 0)
    } finally {
      closeDb()
      process.env.DATA_DIR = prev
      await rm(legacyDir, { recursive: true, force: true })
    }
  })

  it('closeDb is safe to call repeatedly', () => {
    getDb()
    closeDb()
    closeDb()
  })

  it('rolls back a failed legacy import', async () => {
    closeDb()
    const legacyDir = await mkdtemp(join(tmpdir(), 'estimator-fail-'))
    const prev = process.env.DATA_DIR
    process.env.DATA_DIR = legacyDir
    try {
      const sqliteFile = join(legacyDir, 'estimator.sqlite')
      const poisoned = new DatabaseSync(sqliteFile)
      poisoned.exec(`
        CREATE TABLE quotes (
          id TEXT PRIMARY KEY NOT NULL,
          created_at TEXT NOT NULL,
          project_type TEXT NOT NULL,
          add_on_ids TEXT NOT NULL DEFAULT '[]',
          extra_sections TEXT NOT NULL DEFAULT '0',
          min REAL NOT NULL,
          max REAL NOT NULL,
          lang TEXT,
          quote_ref TEXT,
          summary TEXT,
          status TEXT NOT NULL DEFAULT 'draft'
        );
        CREATE TABLE leads (
          id TEXT PRIMARY KEY NOT NULL,
          created_at TEXT NOT NULL,
          name TEXT NOT NULL,
          email TEXT NOT NULL,
          message TEXT,
          subject TEXT,
          project_type TEXT,
          timeline TEXT,
          quote_ref TEXT,
          source TEXT,
          lang TEXT,
          status TEXT NOT NULL DEFAULT 'new'
        );
        CREATE TRIGGER fail_quote_insert BEFORE INSERT ON quotes
        BEGIN
          SELECT RAISE(ABORT, 'forced import failure');
        END;
      `)
      poisoned.close()

      await writeFile(
        join(legacyDir, 'quotes.json'),
        JSON.stringify([
          { ...SAMPLE_QUOTE, id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
        ]),
        'utf8'
      )

      assert.throws(() => getDb())
      closeDb()
    } finally {
      closeDb()
      process.env.DATA_DIR = prev
      await rm(legacyDir, { recursive: true, force: true })
    }
  })

  it('ignores rename failures after a successful import', async () => {
    closeDb()
    const legacyDir = await mkdtemp(join(tmpdir(), 'estimator-rename-'))
    const prev = process.env.DATA_DIR
    process.env.DATA_DIR = legacyDir
    try {
      await writeFile(
        join(legacyDir, 'quotes.json'),
        JSON.stringify([SAMPLE_QUOTE]),
        'utf8'
      )
      await mkdir(join(legacyDir, 'quotes.json.migrated'))
      getDb()
      assert.strictEqual(await store.countQuotes(), 1)

      const database = getDb()
      const realClose = database.close.bind(database)
      database.close = () => {
        realClose()
        throw new Error('close failed')
      }
      closeDb()
    } finally {
      closeDb()
      process.env.DATA_DIR = prev
      await rm(legacyDir, { recursive: true, force: true })
    }
  })
})
