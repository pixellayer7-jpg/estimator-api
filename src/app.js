import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { randomUUID } from 'node:crypto'
import { appendQuote, findQuoteById, listQuotesRecent } from './store.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf8')
)

export default async function buildApp() {
  const app = Fastify({ logger: false })

  const origins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  await app.register(cors, {
    origin: origins.length ? origins : true,
  })

  app.get('/', async () => ({
    service: 'estimator-api',
    version: pkg.version,
    endpoints: {
      health: '/health',
      listQuotes: 'GET /api/v1/quotes?limit=20',
      createQuote: 'POST /api/v1/quotes',
      getQuote: 'GET /api/v1/quotes/:id',
    },
  }))

  app.get('/health', async () => ({ ok: true, service: 'estimator-api' }))

  app.get('/api/v1/quotes', async (request) => {
    let limit = 20
    const raw = request.query.limit
    if (raw !== undefined && raw !== '') {
      const p = Number.parseInt(String(raw), 10)
      if (Number.isFinite(p)) limit = p
    }
    const items = await listQuotesRecent(limit)
    return { count: items.length, items }
  })

  app.post('/api/v1/quotes', async (request, reply) => {
    const body = request.body
    if (!body || typeof body !== 'object') {
      return reply.code(400).send({ error: 'JSON body required' })
    }
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

    if (typeof projectType !== 'string' || !projectType) {
      return reply.code(400).send({ error: 'projectType is required' })
    }
    if (!Array.isArray(addOnIds)) {
      return reply.code(400).send({ error: 'addOnIds must be an array' })
    }
    const minNum = typeof min === 'number' ? min : Number(min)
    const maxNum = typeof max === 'number' ? max : Number(max)
    if (!Number.isFinite(minNum) || !Number.isFinite(maxNum)) {
      return reply
        .code(400)
        .send({ error: 'min and max must be finite numbers' })
    }

    const id = randomUUID()
    const createdAt = new Date().toISOString()
    const record = {
      id,
      createdAt,
      projectType,
      addOnIds,
      extraSections: extraSections ?? '0',
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
    })
  })

  app.get('/api/v1/quotes/:id', async (request, reply) => {
    const { id } = request.params
    const row = await findQuoteById(id)
    if (!row) return reply.code(404).send({ error: 'Not found' })
    return row
  })

  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({ error: 'Not found' })
  })

  return app
}
