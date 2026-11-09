import { mkdirSync, readFileSync, renameSync, existsSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const __dirname = dirname(fileURLToPath(import.meta.url))

let db = null
let dbPath = null

function dataDir() {
  const root = join(__dirname, '..')
  return process.env.DATA_DIR || join(root, 'data')
}

function sqlitePath() {
  return join(dataDir(), 'estimator.sqlite')
}

function migrateSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS quotes (
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
    CREATE INDEX IF NOT EXISTS idx_quotes_created ON quotes(created_at);

    CREATE TABLE IF NOT EXISTS leads (
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
    CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);
  `)
}

function parseJsonArray(file, label) {
  if (!existsSync(file)) return null
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'))
    return Array.isArray(data) ? data : null
  } catch (e) {
    console.warn(`[estimator-api] skip ${label} import: ${e.message}`)
    return null
  }
}

function importLegacyJson(database, dir) {
  const quoteCount = database
    .prepare('SELECT COUNT(*) AS n FROM quotes')
    .get().n
  const leadCount = database.prepare('SELECT COUNT(*) AS n FROM leads').get().n
  if (quoteCount > 0 || leadCount > 0) return

  const quotesFile = join(dir, 'quotes.json')
  const leadsFile = join(dir, 'leads.json')
  const quotes = parseJsonArray(quotesFile, 'quotes.json')
  const leads = parseJsonArray(leadsFile, 'leads.json')
  if (!quotes && !leads) return

  database.exec('BEGIN')
  try {
    const insertQuote = database.prepare(`
      INSERT OR IGNORE INTO quotes (
        id, created_at, project_type, add_on_ids, extra_sections,
        min, max, lang, quote_ref, summary, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const insertLead = database.prepare(`
      INSERT OR IGNORE INTO leads (
        id, created_at, name, email, message, subject, project_type,
        timeline, quote_ref, source, lang, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    for (const q of quotes || []) {
      if (!q?.id) continue
      insertQuote.run(
        q.id,
        q.createdAt || new Date().toISOString(),
        q.projectType || 'landing',
        JSON.stringify(Array.isArray(q.addOnIds) ? q.addOnIds : []),
        String(q.extraSections ?? '0'),
        Number(q.min) || 0,
        Number(q.max) || 0,
        q.lang ?? null,
        q.quoteRef ?? null,
        q.summary ?? null,
        q.status || 'draft'
      )
    }
    for (const l of leads || []) {
      if (!l?.id) continue
      insertLead.run(
        l.id,
        l.createdAt || new Date().toISOString(),
        l.name || '',
        l.email || '',
        l.message ?? null,
        l.subject ?? null,
        l.projectType ?? null,
        l.timeline ?? null,
        l.quoteRef ?? null,
        l.source ?? null,
        l.lang ?? null,
        l.status || 'new'
      )
    }
    database.exec('COMMIT')
  } catch (e) {
    database.exec('ROLLBACK')
    throw e
  }

  for (const file of [quotesFile, leadsFile]) {
    if (!existsSync(file)) continue
    try {
      renameSync(file, `${file}.migrated`)
    } catch {
      /* ignore — leave JSON in place if rename is blocked */
    }
  }
  console.info(
    `[estimator-api] imported legacy JSON into SQLite (${(quotes || []).length} quotes, ${(leads || []).length} leads)`
  )
}

/** Open (or reopen) the SQLite database for the current DATA_DIR. */
export function getDb() {
  const file = sqlitePath()
  if (db && dbPath === file) return db
  if (db) {
    try {
      db.close()
    } catch {
      /* ignore */
    }
    db = null
    dbPath = null
  }

  const dir = dataDir()
  mkdirSync(dir, { recursive: true })
  const database = new DatabaseSync(file)
  try {
    database.exec('PRAGMA journal_mode = WAL')
    database.exec('PRAGMA foreign_keys = ON')
    migrateSchema(database)
    importLegacyJson(database, dir)
  } catch (e) {
    try {
      database.close()
    } catch {
      /* ignore */
    }
    throw e
  }
  db = database
  dbPath = file
  return db
}

export function closeDb() {
  if (!db) return
  try {
    db.close()
  } catch {
    /* ignore */
  }
  db = null
  dbPath = null
}

/** Close SQLite and/or Postgres pool (tests + graceful shutdown). */
export async function closeStorage() {
  closeDb()
  const { closePool } = await import('./pg.js')
  await closePool()
}

export function getSqlitePath() {
  return sqlitePath()
}

export function getDataDir() {
  return dataDir()
}

/**
 * Consistent on-disk snapshot via `VACUUM INTO` (after a WAL checkpoint).
 * @param {string} [destPath] absolute path; default `DATA_DIR/estimator-backup-<iso>.sqlite`
 * @returns {{ path: string, filename: string }}
 */
export function createSqliteBackup(destPath) {
  const db = getDb()
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = `estimator-backup-${stamp}.sqlite`
  const target = destPath || join(dataDir(), filename)
  mkdirSync(dirname(target), { recursive: true })
  if (existsSync(target)) {
    throw new Error(`Backup target already exists: ${target}`)
  }
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  const escaped = target.replaceAll("'", "''")
  db.exec(`VACUUM INTO '${escaped}'`)
  return { path: target, filename: basename(target) }
}
