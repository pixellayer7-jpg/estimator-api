#!/usr/bin/env node
/**
 * Offline SQLite snapshot into DATA_DIR (same VACUUM INTO path as GET /api/v1/backup).
 * Usage: npm run backup
 */
import { createSqliteBackup, closeDb, getDataDir } from '../src/db.js'

try {
  const { path, filename } = createSqliteBackup()
  console.log(`[estimator-api] backup written: ${path}`)
  console.log(`[estimator-api] DATA_DIR=${getDataDir()} file=${filename}`)
} finally {
  closeDb()
}
