import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const base = 'public/vi-nsg';
for (const kind of ['category', 'product']) {
  const dir = path.join(base, kind);
  let dirs = [];
  try { dirs = await readdir(dir); } catch { console.log(kind, 'missing'); continue; }

  const rows = [];
  for (const s of dirs.slice(0, 200)) {
    const f = path.join(dir, s, 'index.html');
    let h = '';
    try { h = await readFile(f, 'utf8'); } catch { continue; }
    const title = (h.match(/<title>([^<]*)/) || [])[1] || '';
    rows.push({ s, title: title.trim(), kb: Math.round(h.length / 1024) });
  }
  console.log(`\n=== ${kind}: ${rows.length} pages ===`);
  rows.slice(0, 6).forEach((r) => console.log(`  ${r.s.padEnd(38)} ${String(r.kb).padStart(4)}KB  ${r.title.slice(0, 54)}`));
  const uniq = new Set(rows.map((r) => r.title));
  console.log(`  唯一标题: ${uniq.size}/${rows.length}`);
}
