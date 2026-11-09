import * as pg from './pg.js'

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
    const raw = row.add_on_ids
    const parsed =
      typeof raw === 'string'
        ? JSON.parse(raw || '[]')
        : Array.isArray(raw)
          ? raw
          : []
    addOnIds = Array.isArray(parsed) ? parsed : []
  } catch {
    addOnIds = []
  }
  return {
    id: row.id,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at,
    projectType: row.project_type,
    addOnIds,
    extraSections: row.extra_sections,
    min: Number(row.min),
    max: Number(row.max),
    lang: row.lang,
    quoteRef: row.quote_ref,
    summary: row.summary,
    status: row.status || 'draft',
  }
}

function quoteInsertParams(q) {
  return [
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
  ]
}

export async function readQuotes() {
  const { rows } = await pg.query(
    'SELECT * FROM quotes ORDER BY created_at ASC, id ASC'
  )
  return rows.map(rowToQuote)
}

export async function writeQuotes(quotes) {
  return enqueue(async () =>
    pg.withTransaction(async (client) => {
      await client.query('DELETE FROM quotes')
      for (const q of quotes) {
        await client.query(
          `
          INSERT INTO quotes (
            id, created_at, project_type, add_on_ids, extra_sections,
            min, max, lang, quote_ref, summary, status
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        `,
          quoteInsertParams(q)
        )
      }
    })
  )
}

export async function appendQuote(record) {
  return enqueue(async () =>
    pg.withTransaction(async (client) => {
      await client.query(
        `
        INSERT INTO quotes (
          id, created_at, project_type, add_on_ids, extra_sections,
          min, max, lang, quote_ref, summary, status
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      `,
        quoteInsertParams(record)
      )
      const { rows } = await client.query(
        'SELECT COUNT(*)::int AS n FROM quotes'
      )
      const count = rows[0].n
      if (count > MAX_QUOTES) {
        await client.query(
          `
          DELETE FROM quotes WHERE id IN (
            SELECT id FROM quotes
            ORDER BY created_at ASC, id ASC
            LIMIT $1
          )
        `,
          [count - MAX_QUOTES]
        )
      }
      return record
    })
  )
}

export async function findQuoteById(id) {
  const { rows } = await pg.query('SELECT * FROM quotes WHERE id = $1', [id])
  return rowToQuote(rows[0])
}

export async function listQuotesRecent(limit = 20) {
  const n = Math.min(100, Math.max(1, Math.floor(limit) || 20))
  const { rows } = await pg.query(
    `
    SELECT id, created_at, project_type, min, max, lang, status
    FROM quotes
    ORDER BY created_at DESC, id DESC
    LIMIT $1
  `,
    [n]
  )
  return rows.map((row) => ({
    id: row.id,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at,
    projectType: row.project_type,
    min: Number(row.min),
    max: Number(row.max),
    lang: row.lang,
    status: row.status || 'draft',
  }))
}

export async function updateQuoteById(id, patch) {
  return enqueue(async () => {
    const existing = await findQuoteById(id)
    if (!existing) return null
    const updated = { ...existing, ...patch }
    const setParams = quoteInsertParams(updated)
    await pg.query(
      `
      UPDATE quotes SET
        created_at = $1,
        project_type = $2,
        add_on_ids = $3,
        extra_sections = $4,
        min = $5,
        max = $6,
        lang = $7,
        quote_ref = $8,
        summary = $9,
        status = $10
      WHERE id = $11
    `,
      [
        setParams[1],
        setParams[2],
        setParams[3],
        setParams[4],
        setParams[5],
        setParams[6],
        setParams[7],
        setParams[8],
        setParams[9],
        setParams[10],
        id,
      ]
    )
    return updated
  })
}

export async function countQuotes() {
  const { rows } = await pg.query('SELECT COUNT(*)::int AS n FROM quotes')
  return rows[0].n
}

export async function quoteStatusBreakdown() {
  const { rows } = await pg.query('SELECT status FROM quotes')
  const counts = { draft: 0, sent: 0, accepted: 0, declined: 0 }
  for (const row of rows) {
    const s = row.status || 'draft'
    if (s in counts) counts[s] += 1
    else counts.draft += 1
  }
  return counts
}

export async function checkStorageReady() {
  const { rows } = await pg.query('SELECT 1 AS ok')
  if (!rows[0] || rows[0].ok !== 1) throw new Error('Storage probe failed')
}
