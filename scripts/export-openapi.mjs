/**
 * Write docs/openapi.json from the same builder as GET /api/v1/openapi.json.
 * Run: npm run docs:openapi
 */
import { writeFileSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildOpenApiDocument } from '../src/app.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const out = join(root, 'docs', 'openapi.json')
const doc = buildOpenApiDocument(pkg.version)
writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
console.log(`Wrote ${out} (OpenAPI ${doc.openapi}, info.version ${doc.info.version})`)
