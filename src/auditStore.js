import { usePostgres } from './driver.js'
import * as sqliteAudit from './sqliteAuditStore.js'
import * as pgAudit from './pgAuditStore.js'

function impl() {
  return usePostgres() ? pgAudit : sqliteAudit
}

export async function appendAuditEvent(record) {
  return impl().appendAuditEvent(record)
}

export async function listAuditEvents(limit, options) {
  return impl().listAuditEvents(limit, options)
}

export async function clearAuditEvents() {
  return impl().clearAuditEvents()
}
