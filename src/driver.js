/** Storage driver selection: Postgres when DATABASE_URL is set, else SQLite. */

export function usePostgres() {
  return Boolean(String(process.env.DATABASE_URL || '').trim())
}

export function getStorageDriver() {
  return usePostgres() ? 'postgres' : 'sqlite'
}
