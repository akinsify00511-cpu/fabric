import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const migrationRoot = join(process.cwd(), 'supabase', 'migrations')
const forbiddenTenantPredicate = /business_id\s+IN\s*\(\s*SELECT\s+businesses\.id\s+FROM\s+businesses/i
const failOpenPattern = /\bFAIL_OPEN\b|return\s+FAIL_OPEN\b/i

const failures = []

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) await walk(path)
    else if (entry.isFile() && entry.name.endsWith('.sql')) {
      const text = await readFile(path, 'utf8')
      if (forbiddenTenantPredicate.test(text)) failures.push(`${path}: forbidden cross-tenant business predicate`)
    }
  }
}

await walk(migrationRoot)

const authSecurity = await readFile(join(process.cwd(), 'src', 'lib', 'authSecurity.ts'), 'utf8')
if (failOpenPattern.test(authSecurity)) failures.push('src/lib/authSecurity.ts: auth rate limiting must not fail open')
if (!authSecurity.includes('SECURITY_CONTROL_UNAVAILABLE') || !authSecurity.includes('allowed: false')) {
  failures.push('src/lib/authSecurity.ts: missing explicit fail-closed security-control state')
}

if (failures.length) {
  console.error('SECURITY INVARIANT CHECK FAILED')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('SECURITY INVARIANT CHECK PASSED')
console.log('- No forbidden business_id existence-only tenant predicates in migrations')
console.log('- Auth rate limiting is explicitly fail-closed when its control path is unavailable')
