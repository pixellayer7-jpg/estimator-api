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
  return leads.slice(-n).reverse().map((l) => ({
    id: l.id,
    createdAt: l.createdAt,
    name: l.name,
    email: l.email,
    source: l.source,
    status: l.status || 'new',
    quoteRef: l.quoteRef ?? null,
    projectType: l.projectType ?? null,
  }))
}

export async function countLeads() {
  const leads = await readLeads()
  return leads.length
}

export async function findLeadById(id) {
  const leads = await readLeads()
  return leads.find((l) => l.id === id) ?? null
}

export async function updateLeadById(id, patch) {
  let updated = null
  appendQueue = appendQueue.then(async () => {
    const leads = await readLeads()
    const idx = leads.findIndex((l) => l.id === id)
    if (idx === -1) return null
    updated = { ...leads[idx], ...patch }
    leads[idx] = updated
    await writeLeadsAtomic(leads)
    return updated
  })
  await appendQueue
  return updated
}

/** Status counts for /api/v1/stats */
export async function leadStatusBreakdown() {
  const leads = await readLeads()
  const counts = { new: 0, contacted: 0, qualified: 0, closed: 0 }
  for (const l of leads) {
    const s = l.status || 'new'
    if (s in counts) counts[s] += 1
    else counts.new += 1
  }
  return counts
}
