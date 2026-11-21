/**
 * 把残缺的商品链接 /vi-nsg/product/<sku> 补成规范格式 /vi-nsg/product/<slug>-<sku>-p<id>
 *   node scripts/fix-short-product-links.mjs [--dry]
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const PUBLIC = path.resolve('public');
const dry = process.argv.includes('--dry');

const full = JSON.parse(await readFile(path.join(PUBLIC, 'data', 'products-full.json'), 'utf8'));
const bySku = new Map();
for (const p of full.products) if (p.sku) bySku.set(String(p.sku), p);
console.log(`indexed products: ${bySku.size}`);

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) await walk(f, out);
    else if (e.name.endsWith('.html')) out.push(f);
  }
  return out;
}

const files = await walk(PUBLIC);
const SHORT = /href="\/vi-nsg\/product\/(\d{8,14})"/g;

/* 先统计 */
let kinds = new Set();
let total = 0;
for (const f of files) {
  const h = await readFile(f, 'utf8');
  for (const m of h.matchAll(SHORT)) { kinds.add(m[1]); total++; }
}
console.log(`残缺链接：${kinds.size} 种 SKU，共 ${total} 处引用`);

let touched = 0, fixed = 0, unmatched = 0;

for (const file of files) {
  const src = await readFile(file, 'utf8');
  let n = 0;
  const out = src.replace(SHORT, (m, sku) => {
    const p = bySku.get(sku);
    if (!p || !p.url) { unmatched++; return m; }
    n++;
    return `href="${p.url}"`;
  });
  if (n > 0) {
    touched++;
    fixed += n;
    if (!dry) await writeFile(file, out, 'utf8');
  }
}

console.log(`files touched=${touched} fixed=${fixed} unmatched=${unmatched}${dry ? '  [dry]' : ''}`);
