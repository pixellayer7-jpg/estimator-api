import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MAX_LEADS = 10_000

let appendQueue = Promise.resolve()

function dataPath() {
  const root = join(__dirname, '..')
  const dir = process.env.DATA_DIR || join(root, 'data')
  return { dir, file: join(dir, 'leads.json') }
}

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true })
}

export async function readLeads() {
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

async function writeLeadsAtomic(leads) {
  const { dir, file } = dataPath()
  await ensureDir(dir)
  const tmp = `${file}.tmp`
  await writeFile(tmp, JSON.stringify(leads), 'utf8')
  await rename(tmp, file)
}

export async function appendLead(record) {
  appendQueue = appendQueue.then(async () => {
    let leads = await readLeads()
    leads.push(record)
    if (leads.length > MAX_LEADS) {
      leads = leads.slice(-MAX_LEADS)
    }
    await writeLeadsAtomic(leads)
    return record
  })
  return appendQueue
}

export async function listLeadsRecent(limit = 20) {
  const leads = await readLeads()
  const n = Math.min(100, Math.max(1, Math.floor(limit) || 20))
  return leads.slice(-n).reverse()
}

export async function countLeads() {
  const leads = await readLeads()
  return leads.length
}
