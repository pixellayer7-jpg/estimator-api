import * as pg from './pg.js'

const MAX_LEADS = 10_000

let writeQueue = Promise.resolve()

function enqueue(task) {
  writeQueue = writeQueue.then(task, task)
  return writeQueue
}

function rowToLead(row) {
  if (!row) return null
  return {
    id: row.id,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at,
    name: row.name,
    email: row.email,
    message: row.message,
    subject: row.subject,
    projectType: row.project_type,
    timeline: row.timeline,
    quoteRef: row.quote_ref,
    source: row.source,
    lang: row.lang,
    status: row.status || 'new',
  }
}

function leadInsertParams(l) {
  return [
    l.id,
    l.createdAt,
    l.name,
    l.email,
    l.message ?? null,
    l.subject ?? null,
    l.projectType ?? null,
    l.timeline ?? null,
    l.quoteRef ?? null,
    l.source ?? null,
    l.lang ?? null,
    l.status || 'new',
  ]
}

export async function readLeads() {
  const { rows } = await pg.query(
    'SELECT * FROM leads ORDER BY created_at ASC, id ASC'
  )
  return rows.map(rowToLead)
}

export async function writeLeads(leads) {
  return enqueue(async () =>
    pg.withTransaction(async (client) => {
      await client.query('DELETE FROM leads')
      for (const l of leads) {
        await client.query(
          `
          INSERT INTO leads (
            id, created_at, name, email, message, subject, project_type,
            timeline, quote_ref, source, lang, status
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        `,
          leadInsertParams(l)
        )
      }
    })
  )
}

export async function appendLead(record) {
  return enqueue(async () =>
    pg.withTransaction(async (client) => {
      await client.query(
        `
        INSERT INTO leads (
          id, created_at, name, email, message, subject, project_type,
          timeline, quote_ref, source, lang, status
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      `,
        leadInsertParams(record)
      )
      const { rows } = await client.query(
        'SELECT COUNT(*)::int AS n FROM leads'
      )
      const count = rows[0].n
      if (count > MAX_LEADS) {
        await client.query(
          `
          DELETE FROM leads WHERE id IN (
            SELECT id FROM leads
            ORDER BY created_at ASC, id ASC
            LIMIT $1
          )
        `,
          [count - MAX_LEADS]
        )
      }
      return record
    })
  )
}

export async function listLeadsRecent(limit = 20) {
  const n = Math.min(100, Math.max(1, Math.floor(limit) || 20))
  const { rows } = await pg.query(
    `
    SELECT id, created_at, name, email, source, status, quote_ref, project_type
    FROM leads
    ORDER BY created_at DESC, id DESC
    LIMIT $1
  `,
    [n]
  )
  return rows.map((l) => ({
    id: l.id,
    createdAt:
      l.created_at instanceof Date ? l.created_at.toISOString() : l.created_at,
    name: l.name,
    email: l.email,
    source: l.source,
    status: l.status || 'new',
    quoteRef: l.quote_ref ?? null,
    projectType: l.project_type ?? null,
  }))
}

export async function countLeads() {
  const { rows } = await pg.query('SELECT COUNT(*)::int AS n FROM leads')
  return rows[0].n
}

export async function findLeadById(id) {
  const { rows } = await pg.query('SELECT * FROM leads WHERE id = $1', [id])
  return rowToLead(rows[0])
}

export async function updateLeadById(id, patch) {
  return enqueue(async () => {
    const existing = await findLeadById(id)
    if (!existing) return null
    const updated = { ...existing, ...patch }
    const p = leadInsertParams(updated)
    await pg.query(
      `
      UPDATE leads SET
        created_at = $1,
        name = $2,
        email = $3,
        message = $4,
        subject = $5,
        project_type = $6,
        timeline = $7,
        quote_ref = $8,
        source = $9,
        lang = $10,
        status = $11
      WHERE id = $12
    `,
      [p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8], p[9], p[10], p[11], id]
    )
    return updated
  })
}

export async function leadStatusBreakdown() {
  const { rows } = await pg.query('SELECT status FROM leads')
  const counts = { new: 0, contacted: 0, qualified: 0, closed: 0 }
  for (const row of rows) {
    const s = row.status || 'new'
    if (s in counts) counts[s] += 1
    else counts.new += 1
  }
  return counts
}
