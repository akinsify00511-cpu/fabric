import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const OLD = 'https://avenize.riverwayse.com';
const NEW = 'https://avenize.com';
const root = new URL('../dist/', import.meta.url);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (/\.(html?|json|xml|txt|js|css|mjs|map)$/i.test(entry.name)) {
      const before = await readFile(path, 'utf8');
      const after = before.replaceAll(OLD, NEW);
      if (after !== before) await writeFile(path, after);
    }
  }
}

await stat(new URL('.', root));
await walk(root.pathname);
console.log(`Production domain normalization complete: ${OLD} -> ${NEW}`);
