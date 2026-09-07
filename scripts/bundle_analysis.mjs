#!/usr/bin/env node
/**
 * Avenize Bundle Analysis — repeatable performance-intelligence workflow.
 *
 * Parses a built dist/ directory (npm run build first) plus the emitted
 * Vite manifest into a deterministic human-readable report:
 *
 *   - Total JS weight (raw + gzip) per chunk, sorted desc.
 *
 *   - Eager entry chunks vs lazy route chunks (heavy lazy chunks are OK
 *   if they are route-scoped; eager bloat is a regression signal).
 *
 *   - Duplicate package presence across eager chunks (worth investigating).
 *
 * Exits 0 when the report is written; exits 1 when a hard budget
 * is exceeded (defaults: none,) so CI can opt-in via
 *   ENG_BUDGET_ENTRY_GZIP=180 (KiB; default 0 = disabled).
 */

import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist', 'assets')
const MANIFEST = join(ROOT, 'dist', '.vite', 'manifest.json')
const KB = 1024

async function main() {
  const entryBudget = Number(process.env.ENG_BUDGET_ENTRY_GZIP || 0)

  let manifest = null
  try { manifest = JSON.parse(await readFile(MANIFEST, 'utf-8')) } catch { /* no manifest */ }

  const files = []
  try {
    for (const name of await readdir(DIST)) {
      if (!/\.(js|css)$/.test(name)) continue
      const buf = await readFile(join(DIST, name))
      files.push({
        file: name, raw: buf.byteLength,
        gzip: gzipSync(buf).byteLength,
      })
    }
  } catch { /* assets dir missing */ }

  files.sort((a, b) => b.raw - a.raw)

  const manifestChunks = new Map()
  if (manifest) {
    for (const [src, entry] of Object.entries(manifest)) {
      manifestChunks.set(entry.file, {
        imports: (entry.imports || []).filter((f) => /\.(js|css)$/.test(f)),
        dynamicImports: (entry.dynamicImports || []).filter((f) => /\.(js|css)$/.test(f)),
      })
    }
  }

  const byFile = new Set(files.map((f) => f.file))
  const eagerEdge = new Map()
  const entryEager = new Map()

  const resolve = (name) => {
    const m = manifestChunks.get(name)
    if (!m) return []
    return (m.imports || []).filter((f) => byFile.has(f))
  }

  for (const [file, m] of manifestChunks) {
    if (!byFile.has(file)) continue
    eagerEdge.set(file, new Set((m.imports || []).filter((f) => byFile.has(f))))
    const seen = new Set()
    const walk = (f, depth) => {
      if (depth > 16) return
      if (seen.has(f)) return
      seen.add(f)
      for (const dep of resolve(f)) {
        if (!seen.has(dep)) walk(dep, depth + 1)
      }
    }
    walk(file, 0)
    if ((m.dynamicImports || []).length === 0) {
      entryEager.set(file, seen)
    }
  }

  const dedupeCandidates = new Map()
  for (const [file,, deps] of eagerEdge) {
    for (const dep of deps) {
      const own = entryEager.get(file)?.has(dep) ?? false
      if (own) {
        if (!dedupeCandidates.has(dep)) dedupeCandidates.set(dep, [])
        dedupeCandidates.get(dep).push(file)
      }
    }
  }

  let eagerTotal = 0
  let lazyTotal = 0
  let eagerCount = 0
  for (const f of files) {
    if (!f.file.endsWith('.js')) continue
    if (f.file.startsWith('index-')) { eagerTotal += f.gzip; eagerCount += 1 }
    else { lazyTotal += f.gzip }
  }

  const budgetBreaches = []
  if (entryBudget > 0) {
    for (const f of files) {
      if (!f.file.startsWith('index-')) continue
      if (f.gzip > entryBudget * KB) budgetBreaches.push(`chunk ${f.file} ${(f.gzip / KB).toFixed(1)}KiB gzip exceeds entry budget ${entryBudget}KiB`)
    }
  }

  const lines = []
  lines.push('Avenize Bundle Analysis')
  lines.push('──────────────────────────')
  const totalGzip = files.reduce((a, f) => a + f.gzip, 0)
  lines.push(`Total JS+CSS gzip: ${(totalGzip / KB).toFixed(1)} KiB (${files.length} assets)`)
  lines.push(`Eager (index-*) gzip: ${(eagerTotal / KB).toFixed(1)} KiB (${eagerCount} chunks)`)
  lines.push(`Lazy / route chunks gzip: ${(lazyTotal / KB).toFixed(1)} KiB`)
  lines.push('')
  lines.push('Largest chunks (by gzip):')
  for (const f of files.slice(0, 15)) {
    lines.push(`  ${f.file.padEnd(44)} ${(f.raw / KB).toFixed(1).padStart(9)} KB raw  ${(f.gzip / KB).toFixed(1).padStart(7)} KB gzip`)
  }
  lines.push('')
  lines.push(`Eager duplicate packages (imported by >1 eager chunk): ${dedupeCandidates.size} candidates`)
  for (const [dep, owners] of [...dedupeCandidates].sort((a, b) => b[1].length - a[1].length)) {
    const uniq = [...new Set(owners)]
    if (uniq.length > 1) {
      lines.push(`  ${dep}: ${uniq.join(', ')}`)
    }
  }

  if (budgetBreaches.length) {
    lines.push('')
    lines.push('BUDGET BREACHES:')
    for (const b of budgetBreaches) { lines.push('  ' + String(b)) }
  }

  const fs = await import('node:fs')
  const out = join(ROOT, 'governance', 'reports', 'bundle-analysis.txt')
  fs.mkdirSync(dirname(out), { recursive: true })
  fs.writeFileSync(out, lines.join('\n') + '\n')
  process.stdout.write(lines.join('\n') + '\n')
  process.exit(budgetBreaches.length ? 1 : 0)
}

main().catch((err) => { console.error('bundle_analysis failed:', err); process.exit(1) })
