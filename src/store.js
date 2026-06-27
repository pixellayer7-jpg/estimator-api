import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MAX_QUOTES = 10_000

let appendQueue = Promise.resolve()

function dataPath() {
  const root = join(__dirname, '..')
  const dir = process.env.DATA_DIR || join(root, 'data')
  return { dir, file: join(dir, 'quotes.json') }
}

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true })
}

export async function readQuotes() {
  const { dir, file } = dataPath()
  await ensureDir(dir)
  try {
    const raw = await readFile(file, 'utf8')
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : []
  } catch (e) {
    if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) return []
    throw e
  }
}

async function writeQuotesAtomic(quotes) {
  const { dir, file } = dataPath()
  await ensureDir(dir)
  const tmp = `${file}.tmp`
  await writeFile(tmp, JSON.stringify(quotes), 'utf8')
  await rename(tmp, file)
}

export async function writeQuotes(quotes) {
  await writeQuotesAtomic(quotes)
}

export async function appendQuote(record) {
  appendQueue = appendQueue.then(async () => {
    let quotes = await readQuotes()
    quotes.push(record)
    if (quotes.length > MAX_QUOTES) {
      quotes = quotes.slice(-MAX_QUOTES)
    }
    await writeQuotesAtomic(quotes)
    return record
  })
  return appendQueue
}

export async function findQuoteById(id) {
  const quotes = await readQuotes()
  return quotes.find((q) => q.id === id) ?? null
}

/** Newest first; `limit` clamped to 1–100. Returns summary-safe rows (no full `summary`). */
export async function listQuotesRecent(limit = 20) {
  const quotes = await readQuotes()
  const n = Math.min(100, Math.max(1, Math.floor(limit) || 20))
  const tail = quotes.slice(-n).reverse()
  return tail.map((q) => ({
    id: q.id,
    createdAt: q.createdAt,
    projectType: q.projectType,
    min: q.min,
    max: q.max,
    lang: q.lang,
    status: q.status || 'draft',
  }))
}

export async function updateQuoteById(id, patch) {
  let updated = null
  appendQueue = appendQueue.then(async () => {
    const quotes = await readQuotes()
    const idx = quotes.findIndex((q) => q.id === id)
    if (idx === -1) return null
    updated = { ...quotes[idx], ...patch }
    quotes[idx] = updated
    await writeQuotesAtomic(quotes)
    return updated
  })
  await appendQueue
  return updated
}

/** Total stored quotes (for stats endpoint). */
export async function countQuotes() {
  const quotes = await readQuotes()
  return quotes.length
}

/** Verify DATA_DIR is writable (for /health). */
export async function checkStorageReady() {
  const { dir } = dataPath()
  await ensureDir(dir)
  const probe = join(dir, '.write-probe')
  await writeFile(probe, 'ok', 'utf8')
  const raw = await readFile(probe, 'utf8')
  await unlink(probe).catch(() => {})
  if (raw !== 'ok') throw new Error('Storage probe failed')
}
