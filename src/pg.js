import pg from 'pg'

const { Pool } = pg

let pool = null

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  project_type TEXT NOT NULL,
  add_on_ids TEXT NOT NULL DEFAULT '[]',
  extra_sections TEXT NOT NULL DEFAULT '0',
  min DOUBLE PRECISION NOT NULL,
  max DOUBLE PRECISION NOT NULL,
  lang TEXT,
  quote_ref TEXT,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
);
CREATE INDEX IF NOT EXISTS idx_quotes_created ON quotes(created_at);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
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
`

export function configured() {
  return Boolean(String(process.env.DATABASE_URL || '').trim())
}

export async function getPool() {
  if (!configured()) {
    throw new Error('DATABASE_URL is not set')
  }
  if (pool) return pool
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.PG_POOL_MAX || 10),
  })
  const client = await pool.connect()
  try {
    await client.query(INIT_SQL)
  } finally {
    client.release()
  }
  return pool
}

/** Run schema migrations (idempotent). */
export async function migrate() {
  const p = await getPool()
  await p.query(INIT_SQL)
}

export async function query(text, params = []) {
  const p = await getPool()
  return p.query(text, params)
}

/**
 * @template T
 * @param {(client: import('pg').PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withTransaction(fn) {
  const p = await getPool()
  const client = await p.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      /* ignore */
    }
    throw e
  } finally {
    client.release()
  }
}

export async function closePool() {
  if (!pool) return
  const p = pool
  pool = null
  await p.end()
}
