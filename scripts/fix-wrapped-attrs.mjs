/**
 * 清理 HTML 属性值里的换行（原站有些 src 被折行，导致请求带 %0A 而 404）。
 *   node scripts/fix-wrapped-attrs.mjs
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const PUBLIC = path.resolve('public');

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, out);
    else if (e.name.endsWith('.html')) out.push(full);
  }
  return out;
}

const files = await walk(PUBLIC);
let touched = 0, fixed = 0;

for (const f of files) {
  const src = await readFile(f, 'utf8');
  let n = 0;
  const out = src.replace(/\b(src|href|data-src)="([^"]*)"/g, (m, attr, val) => {
    const cleaned = val.replace(/\s*[\r\n]+\s*/g, '').trim();
    if (cleaned !== val) n++;
    return `${attr}="${cleaned}"`;
  });
  if (n > 0) {
    await writeFile(f, out, 'utf8');
    touched++;
    fixed += n;
  }
}

console.log(`files touched=${touched} attrs fixed=${fixed}`);
