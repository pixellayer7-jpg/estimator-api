import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert'
import {
  authConfigured,
  authenticate,
  authorize,
  loadTokenEntries,
  ROLE_PERMISSIONS,
  safeTokenEquals,
} from './auth.js'

function mockReply() {
  const reply = {
    codeVal: 200,
    body: null,
    headers: {},
    header(k, v) {
      this.headers[k.toLowerCase()] = v
      return this
    },
    code(n) {
      this.codeVal = n
      return this
    },
    send(payload) {
      this.body = payload
      return this
    },
  }
  return reply
}

describe('auth', () => {
  afterEach(() => {
    delete process.env.LIST_QUOTES_TOKEN
    delete process.env.API_TOKENS
  })

  it('safeTokenEquals is length-safe', () => {
    assert.strictEqual(safeTokenEquals('abc', 'abc'), true)
    assert.strictEqual(safeTokenEquals('abc', 'abd'), false)
    assert.strictEqual(safeTokenEquals('abc', 'ab'), false)
  })

  it('treats LIST_QUOTES_TOKEN as admin', () => {
    process.env.LIST_QUOTES_TOKEN = 'legacy-admin'
    const entries = loadTokenEntries()
    assert.deepStrictEqual(entries, [{ role: 'admin', token: 'legacy-admin' }])
    assert.ok(authConfigured())
  })

  it('parses API_TOKENS role:token pairs and JSON', () => {
    process.env.API_TOKENS = 'admin:a1,crm:c1,readonly:r1,bogus:x'
    let entries = loadTokenEntries()
    assert.strictEqual(entries.length, 3)
    assert.ok(entries.some((e) => e.role === 'crm' && e.token === 'c1'))

    process.env.API_TOKENS = JSON.stringify([
      { role: 'readonly', token: 'ro-json' },
      { role: 'admin', token: 'ad-json' },
    ])
    entries = loadTokenEntries()
    assert.strictEqual(entries.length, 2)
    assert.ok(entries.some((e) => e.token === 'ro-json'))
  })

  it('authorize opens list/write when no tokens, but backup is 503', () => {
    const reply = mockReply()
    assert.strictEqual(authorize({ headers: {} }, reply, 'list'), true)
    assert.strictEqual(authorize({ headers: {} }, reply, 'write'), true)
    assert.strictEqual(authorize({ headers: {} }, reply, 'backup'), false)
    assert.strictEqual(reply.codeVal, 503)
  })

  it('enforces role permissions for crm and readonly', () => {
    process.env.API_TOKENS = 'crm:crm-secret,readonly:ro-secret,admin:ad-secret'

    const crmReq = { headers: { authorization: 'Bearer crm-secret' } }
    const roReq = { headers: { authorization: 'Bearer ro-secret' } }
    const adminReq = { headers: { authorization: 'Bearer ad-secret' } }

    assert.strictEqual(authenticate(crmReq)?.role, 'crm')
    assert.strictEqual(authenticate(roReq)?.role, 'readonly')
    assert.deepStrictEqual(
      authenticate(adminReq)?.permissions,
      ROLE_PERMISSIONS.admin
    )

    const reply = mockReply()
    assert.strictEqual(authorize(crmReq, reply, 'list'), true)
    assert.strictEqual(authorize(crmReq, reply, 'write'), true)
    assert.strictEqual(authorize(crmReq, reply, 'backup'), false)
    assert.strictEqual(reply.codeVal, 403)
    assert.strictEqual(reply.body.role, 'crm')

    const reply2 = mockReply()
    assert.strictEqual(authorize(roReq, reply2, 'write'), false)
    assert.strictEqual(reply2.codeVal, 403)

    const reply3 = mockReply()
    assert.strictEqual(authorize(adminReq, reply3, 'backup'), true)

    const reply4 = mockReply()
    assert.strictEqual(authorize({ headers: {} }, reply4, 'list'), false)
    assert.strictEqual(reply4.codeVal, 401)
  })
})
