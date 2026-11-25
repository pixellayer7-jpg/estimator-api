import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeDb, getDb } from './db.js'
import {
  appendAuditEvent,
  clearAuditEvents,
  listAuditEvents,
} from './auditStore.js'

describe('auditStore', () => {
  let prevDir
  let dir

  before(async () => {
    prevDir = process.env.DATA_DIR
    dir = await mkdtemp(join(tmpdir(), 'estimator-audit-'))
    process.env.DATA_DIR = dir
    closeDb()
  })

  after(async () => {
    closeDb()
    process.env.DATA_DIR = prevDir
    await rm(dir, { recursive: true, force: true })
  })

  it('appends, lists, filters, and clears audit events', async () => {
    await clearAuditEvents()
    await appendAuditEvent({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      createdAt: '2026-01-02T00:00:00.000Z',
      action: 'quote.patch',
      resourceType: 'quote',
      resourceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      role: 'crm',
      detail: { status: 'sent', from: 'draft' },
    })
    await appendAuditEvent({
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      createdAt: '2026-01-03T00:00:00.000Z',
      action: 'backup.download',
      resourceType: 'backup',
      resourceId: 'estimator-backup.sqlite',
      role: 'admin',
      detail: { bytes: 12 },
    })
    getDb()
      .prepare(
        `
        INSERT INTO audit_events (
          id, created_at, action, resource_type, resource_id, role, detail
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        '2026-01-01T00:00:00.000Z',
        'lead.patch',
        'lead',
        null,
        null,
        '{not-json'
      )

    const page = await listAuditEvents(10)
    assert.strictEqual(page.total, 3)
    assert.strictEqual(page.items[0].action, 'backup.download')
    assert.deepStrictEqual(page.items[0].detail, { bytes: 12 })

    const filtered = await listAuditEvents(10, { action: 'quote.patch' })
    assert.strictEqual(filtered.total, 1)
    assert.strictEqual(filtered.items[0].role, 'crm')

    const badDetail = page.items.find((e) => e.action === 'lead.patch')
    assert.strictEqual(badDetail.detail, '{not-json')

    await clearAuditEvents()
    assert.strictEqual((await listAuditEvents(5)).total, 0)

    const prevMax = process.env.AUDIT_MAX_EVENTS
    process.env.AUDIT_MAX_EVENTS = '2'
    closeDb()
    try {
      await appendAuditEvent({
        id: '11111111-1111-4111-8111-111111111111',
        createdAt: '2026-02-01T00:00:00.000Z',
        action: 'quote.patch',
        resourceType: 'quote',
        resourceId: null,
        role: 'admin',
        detail: null,
      })
      await appendAuditEvent({
        id: '22222222-2222-4222-8222-222222222222',
        createdAt: '2026-02-02T00:00:00.000Z',
        action: 'quote.patch',
        resourceType: 'quote',
        resourceId: null,
        role: 'admin',
        detail: null,
      })
      await appendAuditEvent({
        id: '33333333-3333-4333-8333-333333333333',
        createdAt: '2026-02-03T00:00:00.000Z',
        action: 'quote.patch',
        resourceType: 'quote',
        resourceId: null,
        role: 'admin',
        detail: null,
      })
      assert.strictEqual((await listAuditEvents(10)).total, 2)
    } finally {
      if (prevMax === undefined) delete process.env.AUDIT_MAX_EVENTS
      else process.env.AUDIT_MAX_EVENTS = prevMax
      closeDb()
    }
  })
})
