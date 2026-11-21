/**
 * 修「动态 banner」卡片的占位链接：<a title="商品名" href="/vi-nsg#"> → 真实商品页
 *   node scripts/fix-banner-links.mjs [--dry]
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const PUBLIC = path.resolve('public');
const dry = process.argv.includes('--dry');

const full = JSON.parse(await readFile(path.join(PUBLIC, 'data', 'products-full.json'), 'utf8'));
const byName = new Map();
for (const p of full.products) {
  if (!p.name) continue;
  const key = String(p.name).trim().toLowerCase();
  if (!byName.has(key)) byName.set(key, p);
}
console.log(`products by name: ${byName.size}`);

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) await walk(f, out);
    else if (e.name.endsWith('.html')) out.push(f);
  }
  return out;
}

const files = await walk(PUBLIC);

/* 先统计占位链接有多少种形态 */
const shapes = new Map();
for (const f of files) {
  const h = await readFile(f, 'utf8');
  for (const m of h.matchAll(/<a\b[^>]*title="([^"]*)"[^>]*href="([^"]*)"[^>]*>/g)) {
    const href = m[2];
    if (/^\/vi-nsg#?$|^#?$|^javascript:void/.test(href)) {
      const key = `${href}`;
      shapes.set(key, (shapes.get(key) || 0) + 1);
    }
  }
}
console.log('占位 href 分布:', JSON.stringify([...shapes.entries()].slice(0, 8)));

let touched = 0, fixed = 0, unmatched = 0;

for (const file of files) {
  const src = await readFile(file, 'utf8');
  let n = 0;
  const out = src.replace(
    /<a\b([^>]*?)title="([^"]*)"([^>]*?)href="(\/vi-nsg#?|#|javascript:void\(0\))"/g,
    (m, pre, title, mid, href) => {
      const p = byName.get(String(title).trim().toLowerCase());
      if (!p || !p.url) { unmatched++; return m; }
      n++;
      return `<a${pre}title="${title}"${mid}href="${p.url}"`;
    },
  );
  if (n > 0) {
    touched++;
    fixed += n;
    if (!dry) await writeFile(file, out, 'utf8');
  }
}

console.log(`files touched=${touched} links fixed=${fixed} unmatched=${unmatched}${dry ? '  [dry]' : ''}`);
