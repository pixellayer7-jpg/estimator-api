#!/usr/bin/env node
/**
 * Apply schema for the active driver.
 * - SQLite: opens DATA_DIR/estimator.sqlite (creates tables + legacy JSON import)
 * - Postgres: runs idempotent DDL against DATABASE_URL
 */
import { usePostgres, getStorageDriver } from '../src/driver.js'
import { getDb, closeStorage } from '../src/db.js'
import { migrate as migratePg } from '../src/pg.js'

try {
  const driver = getStorageDriver()
  console.log(`[estimator-api] migrate driver=${driver}`)
  if (usePostgres()) {
    await migratePg()
    console.log('[estimator-api] Postgres schema ready')
  } else {
    getDb()
    console.log('[estimator-api] SQLite schema ready')
  }
} finally {
  await closeStorage()
}
