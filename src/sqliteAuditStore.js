import { getDb } from './db.js'

function maxEvents() {
  return Number(process.env.AUDIT_MAX_EVENTS) || 10_000
}

let writeQueue = Promise.resolve()

function enqueue(task) {
  writeQueue = writeQueue.then(task, task)
  return writeQueue
}

function rowToEvent(row) {
  if (!row) return null
  let detail = null
  if (row.detail) {
    try {
      detail = JSON.parse(row.detail)
    } catch {
      detail = row.detail
    }
  }
  return {
    id: row.id,
    createdAt: row.created_at,
    action: row.action,
    resourceType: row.resource_type ?? null,
    resourceId: row.resource_id ?? null,
    role: row.role ?? null,
    detail,
  }
}

export async function appendAuditEvent(record) {
  return enqueue(async () => {
    const db = getDb()
    db.prepare(
      `
      INSERT INTO audit_events (
        id, created_at, action, resource_type, resource_id, role, detail
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      record.id,
      record.createdAt,
      record.action,
      record.resourceType ?? null,
      record.resourceId ?? null,
      record.role ?? null,
      record.detail != null ? JSON.stringify(record.detail) : null
    )
    const count = db.prepare('SELECT COUNT(*) AS n FROM audit_events').get().n
    const max = maxEvents()
    if (count > max) {
      db.prepare(
        `
        DELETE FROM audit_events
        WHERE id IN (
          SELECT id FROM audit_events
          ORDER BY created_at ASC, id ASC
          LIMIT ?
        )
      `
      ).run(count - max)
    }
    return record
  })
}

export async function listAuditEvents(limit = 20, options = {}) {
  const db = getDb()
  const n = Math.min(100, Math.max(1, Math.floor(limit) || 20))
  const offset = Math.max(0, Math.floor(Number(options.offset)) || 0)
  const action =
    typeof options.action === 'string' && options.action ? options.action : null

  const where = []
  const params = []
  if (action) {
    where.push('action = ?')
    params.push(action)
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const total = db
    .prepare(`SELECT COUNT(*) AS n FROM audit_events ${whereSql}`)
    .get(...params).n
  const rows = db
    .prepare(
      `
      SELECT id, created_at, action, resource_type, resource_id, role, detail
      FROM audit_events
      ${whereSql}
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `
    )
    .all(...params, n, offset)

  return {
    items: rows.map(rowToEvent),
    total,
    limit: n,
    offset,
  }
}

export async function clearAuditEvents() {
  return enqueue(async () => {
    const db = getDb()
    db.prepare('DELETE FROM audit_events').run()
  })
}
