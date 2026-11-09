import { usePostgres } from './driver.js'
import * as sqliteStore from './sqliteStore.js'
import * as pgStore from './pgStore.js'

function impl() {
  return usePostgres() ? pgStore : sqliteStore
}

/** @internal test helper */
export function _quotesImplForTests() {
  return impl()
}

export async function readQuotes() {
  return impl().readQuotes()
}

export async function writeQuotes(quotes) {
  return impl().writeQuotes(quotes)
}

export async function appendQuote(record) {
  return impl().appendQuote(record)
}

export async function findQuoteById(id) {
  return impl().findQuoteById(id)
}

export async function listQuotesRecent(limit) {
  return impl().listQuotesRecent(limit)
}

export async function updateQuoteById(id, patch) {
  return impl().updateQuoteById(id, patch)
}

export async function countQuotes() {
  return impl().countQuotes()
}

export async function quoteStatusBreakdown() {
  return impl().quoteStatusBreakdown()
}

export async function checkStorageReady() {
  return impl().checkStorageReady()
}
