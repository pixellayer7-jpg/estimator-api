import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { appendQuote, findQuoteById, listQuotesRecent, checkStorageReady } from './store.js'

const PROJECT_TYPES = ['landing', 'website', 'dashboard']
const ADDON_IDS = ['design', 'i18n', 'rush']

/** RFC 9562 UUID v1–v5 shape (ids from `randomUUID`). */
const UUID_PARAM =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** JSON Schema for `POST /api/v1/quotes` (AJV). */
const postQuoteBodySchema = {
  type: 'object',
  required: ['projectType', 'addOnIds', 'min', 'max'],
  properties: {
    projectType: { type: 'string', enum: PROJECT_TYPES },
    addOnIds: {
      type: 'array',
      items: { type: 'string', enum: ADDON_IDS },
    },
    extraSections: { anyOf: [{ type: 'string' }, { type: 'number' }] },
    min: { anyOf: [{ type: 'number' }, { type: 'string' }] },
    max: { anyOf: [{ type: 'number' }, { type: 'string' }] },
    lang: { enum: ['en', 'zh'] },
    quoteRef: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    summary: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
  additionalProperties: false,
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf8')
)

function safeTokenEquals(a, b) {
  const aa = Buffer.from(a)
  const bb = Buffer.from(b)
  return aa.length === bb.length && timingSafeEqual(aa, bb)
}

function getBearerToken(request) {
  const header = request.headers.authorization
  if (typeof header !== 'string') return ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : ''
}

function authorizeQuoteList(request, reply) {
  const expected = String(process.env.LIST_QUOTES_TOKEN || '').trim()
  if (!expected) return true
  const provided = getBearerToken(request)
  if (provided && safeTokenEquals(provided, expected)) return true
  reply
    .header('WWW-Authenticate', 'Bearer')
    .code(401)
    .send({ error: 'Unauthorized' })
  return false
}

export default async function buildApp() {
  const app = Fastify({ logger: false, bodyLimit: 262_144 })

  const origins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  await app.register(cors, {
    origin: origins.length ? origins : true,
  })

  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff')
    reply.header('X-API-Version', pkg.version)
    return payload
  })

  app.setErrorHandler((error, _request, reply) => {
    if (error.validation) {
      return reply.code(400).send({ error: 'Invalid request body' })
    }
    if (error.statusCode) {
      return reply.code(error.statusCode).send({
        error: typeof error.message === 'string' ? error.message : 'Error',
      })
    }
    return reply.code(500).send({ error: 'Internal Server Error' })
  })

  app.get('/', async () => ({
    service: 'estimator-api',
    version: pkg.version,
    links: {
      landing: 'https://pixellayer7-jpg.github.io/1/',
      calculator: 'https://pixellayer7-jpg.github.io/project-estimator/',
    },
    endpoints: {
      health: '/health',
      listQuotes: 'GET /api/v1/quotes?limit=20',
      createQuote: 'POST /api/v1/quotes',
      getQuote: 'GET /api/v1/quotes/:id',
    },
  }))

  app.get('/health', async (_request, reply) => {
    try {
      await checkStorageReady()
      return { ok: true, service: 'estimator-api', version: pkg.version, storage: 'ready' }
    } catch (e) {
      return reply.code(503).send({
        ok: false,
        service: 'estimator-api',
        version: pkg.version,
        storage: 'unavailable',
        error: e instanceof Error ? e.message : 'Storage check failed',
      })
    }
  })

  app.get('/api/v1/quotes', async (request, reply) => {
    if (!authorizeQuoteList(request, reply)) return
    let limit = 20
    const raw = request.query.limit
    if (raw !== undefined && raw !== '') {
      const p = Number.parseInt(String(raw), 10)
      if (Number.isFinite(p)) limit = p
    }
    const items = await listQuotesRecent(limit)
    return { count: items.length, items }
  })

  app.post(
    '/api/v1/quotes',
    { schema: { body: postQuoteBodySchema } },
    async (request, reply) => {
      const body = request.body
      const {
        projectType,
        addOnIds,
        extraSections,
        min,
        max,
        lang,
        quoteRef,
        summary,
      } = body

      const minNum = typeof min === 'number' ? min : Number(min)
      const maxNum = typeof max === 'number' ? max : Number(max)
      if (!Number.isFinite(minNum) || !Number.isFinite(maxNum)) {
        return reply
          .code(400)
          .send({ error: 'min and max must be finite numbers' })
      }
      if (minNum > maxNum) {
        return reply
          .code(400)
          .send({ error: 'min must be less than or equal to max' })
      }
      if (
        typeof quoteRef === 'string' &&
        quoteRef.length > 0 &&
        !UUID_PARAM.test(quoteRef)
      ) {
        return reply.code(400).send({ error: 'Invalid quoteRef' })
      }

      const id = randomUUID()
      const createdAt = new Date().toISOString()
      const extraStoredRaw =
        extraSections === undefined || extraSections === null
          ? 0
          : Number(extraSections)
      const extraClamped = Number.isFinite(extraStoredRaw)
        ? Math.min(20, Math.max(0, Math.floor(extraStoredRaw)))
        : 0
      const extraStored = String(extraClamped)

      const record = {
        id,
        createdAt,
        projectType,
        addOnIds,
        extraSections: extraStored,
        min: minNum,
        max: maxNum,
        lang: typeof lang === 'string' ? lang : 'en',
        quoteRef: typeof quoteRef === 'string' ? quoteRef : null,
        summary: typeof summary === 'string' ? summary : null,
      }

      await appendQuote(record)
      return reply.code(201).send({
        id,
        createdAt,
        path: `/api/v1/quotes/${id}`,
        loadQuery: `?load=${id}`,
      })
    }
  )

  app.get('/api/v1/quotes/:id', async (request, reply) => {
    const { id } = request.params
    if (!UUID_PARAM.test(id)) {
      return reply.code(400).send({ error: 'Invalid id' })
    }
    const row = await findQuoteById(id)
    if (!row) return reply.code(404).send({ error: 'Not found' })
    return row
  })

  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({ error: 'Not found' })
  })

  return app
}
