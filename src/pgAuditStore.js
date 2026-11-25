import * as pg from './pg.js'

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
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at,
    action: row.action,
    resourceType: row.resource_type ?? null,
    resourceId: row.resource_id ?? null,
    role: row.role ?? null,
    detail,
  }
}

export async function appendAuditEvent(record) {
  return enqueue(async () => {
    await pg.query(
      `
      INSERT INTO audit_events (
        id, created_at, action, resource_type, resource_id, role, detail
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
      [
        record.id,
        record.createdAt,
        record.action,
        record.resourceType ?? null,
        record.resourceId ?? null,
        record.role ?? null,
        record.detail != null ? JSON.stringify(record.detail) : null,
      ]
    )
    const countRes = await pg.query(
      'SELECT COUNT(*)::int AS n FROM audit_events'
    )
    const count = countRes.rows[0].n
    const max = maxEvents()
    if (count > max) {
      await pg.query(
        `
        DELETE FROM audit_events
        WHERE id IN (
          SELECT id FROM audit_events
          ORDER BY created_at ASC, id ASC
          LIMIT $1
        )
      `,
        [count - max]
      )
    }
    return record
  })
}

export async function listAuditEvents(limit = 20, options = {}) {
  const n = Math.min(100, Math.max(1, Math.floor(limit) || 20))
  const offset = Math.max(0, Math.floor(Number(options.offset)) || 0)
  const action =
    typeof options.action === 'string' && options.action ? options.action : null

  const where = []
  const params = []
  if (action) {
    params.push(action)
    where.push(`action = $${params.length}`)
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const countRes = await pg.query(
    `SELECT COUNT(*)::int AS n FROM audit_events ${whereSql}`,
    params
  )
  const total = countRes.rows[0].n
  params.push(n)
  const limitIdx = `$${params.length}`
  params.push(offset)
  const offsetIdx = `$${params.length}`
  const listRes = await pg.query(
    `
    SELECT id, created_at, action, resource_type, resource_id, role, detail
    FROM audit_events
    ${whereSql}
    ORDER BY created_at DESC, id DESC
    LIMIT ${limitIdx} OFFSET ${offsetIdx}
  `,
    params
  )

  return {
    items: listRes.rows.map(rowToEvent),
    total,
    limit: n,
    offset,
  }
}

export async function clearAuditEvents() {
  return enqueue(async () => {
    await pg.query('DELETE FROM audit_events')
  })
}
