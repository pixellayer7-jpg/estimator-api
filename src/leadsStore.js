import { usePostgres } from './driver.js'
import * as sqliteLeads from './sqliteLeadsStore.js'
import * as pgLeads from './pgLeadsStore.js'

function impl() {
  return usePostgres() ? pgLeads : sqliteLeads
}

/** @internal test helper */
export function _leadsImplForTests() {
  return impl()
}

export async function readLeads() {
  return impl().readLeads()
}

export async function writeLeads(leads) {
  return impl().writeLeads(leads)
}

export async function appendLead(record) {
  return impl().appendLead(record)
}

export async function listLeadsRecent(limit) {
  return impl().listLeadsRecent(limit)
}

export async function countLeads() {
  return impl().countLeads()
}

export async function findLeadById(id) {
  return impl().findLeadById(id)
}

export async function updateLeadById(id, patch) {
  return impl().updateLeadById(id, patch)
}

export async function leadStatusBreakdown() {
  return impl().leadStatusBreakdown()
}
