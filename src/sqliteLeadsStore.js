import { getDb } from './db.js'

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
    createdAt: row.created_at,
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

/** @returns {object[]} */
export async function readLeads() {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM leads ORDER BY created_at ASC, id ASC')
    .all()
  return rows.map(rowToLead)
}

export async function writeLeads(leads) {
  return enqueue(async () => {
    const db = getDb()
    db.exec('BEGIN')
    try {
      db.prepare('DELETE FROM leads').run()
      const insert = db.prepare(`
        INSERT INTO leads (
          id, created_at, name, email, message, subject, project_type,
          timeline, quote_ref, source, lang, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      for (const l of leads) {
        insert.run(
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
          l.status || 'new'
        )
      }
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  })
}

export async function appendLead(record) {
  return enqueue(async () => {
    const db = getDb()
    db.exec('BEGIN')
    try {
      db.prepare(
        `
        INSERT INTO leads (
          id, created_at, name, email, message, subject, project_type,
          timeline, quote_ref, source, lang, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        record.id,
        record.createdAt,
        record.name,
        record.email,
        record.message ?? null,
        record.subject ?? null,
        record.projectType ?? null,
        record.timeline ?? null,
        record.quoteRef ?? null,
        record.source ?? null,
        record.lang ?? null,
        record.status || 'new'
      )
      const count = db.prepare('SELECT COUNT(*) AS n FROM leads').get().n
      if (count > MAX_LEADS) {
        db.prepare(
          `
          DELETE FROM leads WHERE id IN (
            SELECT id FROM leads
            ORDER BY created_at ASC, id ASC
            LIMIT ?
          )
        `
        ).run(count - MAX_LEADS)
      }
      db.exec('COMMIT')
      return record
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  })
}

export async function listLeadsRecent(limit = 20) {
  const db = getDb()
  const n = Math.min(100, Math.max(1, Math.floor(limit) || 20))
  const rows = db
    .prepare(
      `
      SELECT id, created_at, name, email, source, status, quote_ref, project_type
      FROM leads
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `
    )
    .all(n)
  return rows.map((l) => ({
    id: l.id,
    createdAt: l.created_at,
    name: l.name,
    email: l.email,
    source: l.source,
    status: l.status || 'new',
    quoteRef: l.quote_ref ?? null,
    projectType: l.project_type ?? null,
  }))
}

export async function countLeads() {
  const db = getDb()
  return db.prepare('SELECT COUNT(*) AS n FROM leads').get().n
}

export async function findLeadById(id) {
  const db = getDb()
  const row = db.prepare('SELECT * FROM leads WHERE id = ?').get(id)
  return rowToLead(row)
}

export async function updateLeadById(id, patch) {
  return enqueue(async () => {
    const db = getDb()
    const existing = db.prepare('SELECT * FROM leads WHERE id = ?').get(id)
    if (!existing) return null
    const current = rowToLead(existing)
    const updated = { ...current, ...patch }
    db.prepare(
      `
      UPDATE leads SET
        created_at = ?,
        name = ?,
        email = ?,
        message = ?,
        subject = ?,
        project_type = ?,
        timeline = ?,
        quote_ref = ?,
        source = ?,
        lang = ?,
        status = ?
      WHERE id = ?
    `
    ).run(
      updated.createdAt,
      updated.name,
      updated.email,
      updated.message ?? null,
      updated.subject ?? null,
      updated.projectType ?? null,
      updated.timeline ?? null,
      updated.quoteRef ?? null,
      updated.source ?? null,
      updated.lang ?? null,
      updated.status || 'new',
      id
    )
    return updated
  })
}

/** Status counts for /api/v1/stats */
export async function leadStatusBreakdown() {
  const db = getDb()
  const rows = db.prepare('SELECT status FROM leads').all()
  const counts = { new: 0, contacted: 0, qualified: 0, closed: 0 }
  for (const row of rows) {
    const s = row.status || 'new'
    if (s in counts) counts[s] += 1
    else counts.new += 1
  }
  return counts
}
