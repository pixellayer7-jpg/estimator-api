import { getDb } from './db.js'

const MAX_QUOTES = 10_000

let writeQueue = Promise.resolve()

function enqueue(task) {
  writeQueue = writeQueue.then(task, task)
  return writeQueue
}

function rowToQuote(row) {
  if (!row) return null
  let addOnIds
  try {
    const parsed = JSON.parse(row.add_on_ids || '[]')
    addOnIds = Array.isArray(parsed) ? parsed : []
  } catch {
    addOnIds = []
  }
  return {
    id: row.id,
    createdAt: row.created_at,
    projectType: row.project_type,
    addOnIds,
    extraSections: row.extra_sections,
    min: row.min,
    max: row.max,
    lang: row.lang,
    quoteRef: row.quote_ref,
    summary: row.summary,
    status: row.status || 'draft',
    notes: row.notes ?? null,
  }
}

/** @returns {object[]} */
export async function readQuotes() {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM quotes ORDER BY created_at ASC, id ASC')
    .all()
  return rows.map(rowToQuote)
}

/** Replace all quotes (test helper / admin reset). */
export async function writeQuotes(quotes) {
  return enqueue(async () => {
    const db = getDb()
    db.exec('BEGIN')
    try {
      db.prepare('DELETE FROM quotes').run()
      const insert = db.prepare(`
        INSERT INTO quotes (
          id, created_at, project_type, add_on_ids, extra_sections,
          min, max, lang, quote_ref, summary, status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      for (const q of quotes) {
        insert.run(
          q.id,
          q.createdAt,
          q.projectType,
          JSON.stringify(Array.isArray(q.addOnIds) ? q.addOnIds : []),
          String(q.extraSections ?? '0'),
          Number(q.min),
          Number(q.max),
          q.lang ?? null,
          q.quoteRef ?? null,
          q.summary ?? null,
          q.status || 'draft',
          q.notes ?? null
        )
      }
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  })
}

export async function appendQuote(record) {
  return enqueue(async () => {
    const db = getDb()
    db.exec('BEGIN')
    try {
      db.prepare(
        `
        INSERT INTO quotes (
          id, created_at, project_type, add_on_ids, extra_sections,
          min, max, lang, quote_ref, summary, status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        record.id,
        record.createdAt,
        record.projectType,
        JSON.stringify(Array.isArray(record.addOnIds) ? record.addOnIds : []),
        String(record.extraSections ?? '0'),
        Number(record.min),
        Number(record.max),
        record.lang ?? null,
        record.quoteRef ?? null,
        record.summary ?? null,
        record.status || 'draft',
        record.notes ?? null
      )
      const count = db.prepare('SELECT COUNT(*) AS n FROM quotes').get().n
      if (count > MAX_QUOTES) {
        db.prepare(
          `
          DELETE FROM quotes WHERE id IN (
            SELECT id FROM quotes
            ORDER BY created_at ASC, id ASC
            LIMIT ?
          )
        `
        ).run(count - MAX_QUOTES)
      }
      db.exec('COMMIT')
      return record
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  })
}

export async function findQuoteById(id) {
  const db = getDb()
  const row = db.prepare('SELECT * FROM quotes WHERE id = ?').get(id)
  return rowToQuote(row)
}

/**
 * Newest first; `limit` clamped to 1–100.
 * @param {number} [limit]
 * @param {{ offset?: number, status?: string|null }} [options]
 * @returns {Promise<{ items: object[], total: number, limit: number, offset: number }>}
 */
function escapeLike(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
}

export async function listQuotesRecent(limit = 20, options = {}) {
  const db = getDb()
  const n = Math.min(100, Math.max(1, Math.floor(limit) || 20))
  const offset = Math.max(0, Math.floor(Number(options.offset)) || 0)
  const status =
    typeof options.status === 'string' && options.status ? options.status : null
  const q =
    typeof options.q === 'string' && options.q.trim() ? options.q.trim() : null

  const where = []
  const params = []
  if (status) {
    where.push('status = ?')
    params.push(status)
  }
  if (q) {
    const pat = `%${escapeLike(q.toLowerCase())}%`
    where.push(
      `(lower(ifnull(quote_ref, '')) LIKE ? ESCAPE '\\' OR lower(id) LIKE ? ESCAPE '\\')`
    )
    params.push(pat, pat)
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const total = db
    .prepare(`SELECT COUNT(*) AS n FROM quotes ${whereSql}`)
    .get(...params).n
  const rows = db
    .prepare(
      `
      SELECT id, created_at, project_type, min, max, lang, status, quote_ref, notes
      FROM quotes
      ${whereSql}
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `
    )
    .all(...params, n, offset)

  const items = rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    projectType: row.project_type,
    min: row.min,
    max: row.max,
    lang: row.lang,
    status: row.status || 'draft',
    quoteRef: row.quote_ref ?? null,
    notes: row.notes ?? null,
  }))
  return { items, total, limit: n, offset }
}

export async function updateQuoteById(id, patch) {
  return enqueue(async () => {
    const db = getDb()
    const existing = db.prepare('SELECT * FROM quotes WHERE id = ?').get(id)
    if (!existing) return null
    const current = rowToQuote(existing)
    const updated = { ...current, ...patch }
    db.prepare(
      `
      UPDATE quotes SET
        created_at = ?,
        project_type = ?,
        add_on_ids = ?,
        extra_sections = ?,
        min = ?,
        max = ?,
        lang = ?,
        quote_ref = ?,
        summary = ?,
        status = ?,
        notes = ?
      WHERE id = ?
    `
    ).run(
      updated.createdAt,
      updated.projectType,
      JSON.stringify(Array.isArray(updated.addOnIds) ? updated.addOnIds : []),
      String(updated.extraSections ?? '0'),
      Number(updated.min),
      Number(updated.max),
      updated.lang ?? null,
      updated.quoteRef ?? null,
      updated.summary ?? null,
      updated.status || 'draft',
      updated.notes ?? null,
      id
    )
    return updated
  })
}

export async function countQuotes() {
  const db = getDb()
  return db.prepare('SELECT COUNT(*) AS n FROM quotes').get().n
}

export async function quoteStatusBreakdown() {
  const db = getDb()
  const rows = db.prepare('SELECT status FROM quotes').all()
  const counts = { draft: 0, sent: 0, accepted: 0, declined: 0 }
  for (const row of rows) {
    const s = row.status || 'draft'
    if (s in counts) counts[s] += 1
    else counts.draft += 1
  }
  return counts
}

/** Verify DATA_DIR SQLite is writable (for /health). */
export async function checkStorageReady() {
  const db = getDb()
  const row = db.prepare('SELECT 1 AS ok').get()
  if (!row || row.ok !== 1) throw new Error('Storage probe failed')
}
