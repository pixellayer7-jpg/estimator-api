import { timingSafeEqual } from 'node:crypto'

/** @typedef {'admin' | 'crm' | 'readonly'} AuthRole */
/** @typedef {'list' | 'write' | 'backup' | 'audit'} AuthPermission */

/** @type {Record<AuthRole, Record<AuthPermission, boolean>>} */
export const ROLE_PERMISSIONS = {
  admin: { list: true, write: true, backup: true, audit: true },
  crm: { list: true, write: true, backup: false, audit: false },
  readonly: { list: true, write: false, backup: false, audit: false },
}

export function safeTokenEquals(a, b) {
  const aa = Buffer.from(String(a))
  const bb = Buffer.from(String(b))
  return aa.length === bb.length && timingSafeEqual(aa, bb)
}

export function getBearerToken(request) {
  const header = request.headers.authorization
  if (typeof header !== 'string') return ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : ''
}

/**
 * Parse token registry from env.
 * - `LIST_QUOTES_TOKEN` → admin (backward compatible)
 * - `API_TOKENS` → `admin:tok,crm:tok2,readonly:tok3` or JSON
 *   `[{"role":"admin","token":"..."},...]`
 * @returns {{ role: AuthRole, token: string }[]}
 */
export function loadTokenEntries() {
  /** @type {{ role: AuthRole, token: string }[]} */
  const entries = []
  const seen = new Set()

  function add(role, token) {
    const t = String(token || '').trim()
    const r = String(role || '').trim()
    if (!t || !(r in ROLE_PERMISSIONS)) return
    const key = `${r}\0${t}`
    if (seen.has(key)) return
    seen.add(key)
    entries.push({ role: /** @type {AuthRole} */ (r), token: t })
  }

  const legacy = String(process.env.LIST_QUOTES_TOKEN || '').trim()
  if (legacy) add('admin', legacy)

  const raw = String(process.env.API_TOKENS || '').trim()
  if (!raw) return entries

  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        for (const row of parsed) {
          if (row && typeof row === 'object') {
            add(row.role, row.token)
          }
        }
        return entries
      }
    } catch {
      /* ignore malformed JSON — fall through to pair parser */
    }
  }

  for (const part of raw.split(',')) {
    const chunk = part.trim()
    if (!chunk) continue
    const idx = chunk.indexOf(':')
    if (idx <= 0) continue
    add(chunk.slice(0, idx), chunk.slice(idx + 1))
  }
  return entries
}

export function authConfigured() {
  return loadTokenEntries().length > 0
}

/**
 * @returns {{ role: AuthRole, permissions: Record<AuthPermission, boolean> } | null}
 */
export function authenticate(request) {
  const provided = getBearerToken(request)
  if (!provided) return null
  for (const entry of loadTokenEntries()) {
    if (safeTokenEquals(provided, entry.token)) {
      return {
        role: entry.role,
        permissions: { ...ROLE_PERMISSIONS[entry.role] },
      }
    }
  }
  return null
}

/**
 * @param {AuthPermission} permission
 * @returns {boolean}
 */
export function authorize(request, reply, permission) {
  if (!authConfigured()) {
    if (permission === 'backup') {
      reply.code(503).send({
        error:
          'Backup requires LIST_QUOTES_TOKEN or API_TOKENS to be configured',
      })
      return false
    }
    return true
  }

  const principal = authenticate(request)
  if (!principal) {
    reply
      .header('WWW-Authenticate', 'Bearer')
      .code(401)
      .send({ error: 'Unauthorized' })
    return false
  }

  if (!principal.permissions[permission]) {
    reply.code(403).send({
      error: 'Forbidden',
      role: principal.role,
      permission,
    })
    return false
  }

  request.principal = principal
  return true
}
