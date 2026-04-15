import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

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

export async function writeQuotes(quotes) {
  const { dir, file } = dataPath()
  await ensureDir(dir)
  await writeFile(file, JSON.stringify(quotes), 'utf8')
}

export async function appendQuote(record) {
  const quotes = await readQuotes()
  quotes.push(record)
  await writeQuotes(quotes)
  return record
}

export async function findQuoteById(id) {
  const quotes = await readQuotes()
  return quotes.find((q) => q.id === id) ?? null
}
