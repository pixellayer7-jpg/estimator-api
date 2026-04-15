import Fastify from 'fastify'
import cors from '@fastify/cors'
import { randomUUID } from 'node:crypto'
import { appendQuote, findQuoteById } from './store.js'

export default async function buildApp() {
  const app = Fastify({ logger: false })

  const origins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  await app.register(cors, {
    origin: origins.length ? origins : true,
  })

  app.get('/health', async () => ({ ok: true, service: 'estimator-api' }))

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
    if (typeof min !== 'number' || typeof max !== 'number') {
      return reply.code(400).send({ error: 'min and max must be numbers' })
    }

    const id = randomUUID()
    const createdAt = new Date().toISOString()
    const record = {
      id,
      createdAt,
      projectType,
      addOnIds,
      extraSections: extraSections ?? '0',
      min,
      max,
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

  return app
}
