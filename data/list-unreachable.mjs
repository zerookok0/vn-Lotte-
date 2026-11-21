import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const full = JSON.parse(await readFile('public/data/products-full.json', 'utf8')).products;
const bySku = new Map(full.map((p) => [String(p.sku), p]));
const allSkus = new Set(bySku.keys());

const skuOf = (h) => new Set([...h.matchAll(/-(\d{8,14})(?:-\d{8,14})?-p\d+/g)].map((m) => m[1]));

const homeSkus = skuOf(await readFile('build/r2-site/index.html', 'utf8'));
const catIndex = JSON.parse(await readFile('public/data/cat-index.json', 'utf8'));
const byCat = new Set();
for (const [k, v] of Object.entries(catIndex)) if (k !== '_meta') v.forEach((s) => byCat.add(String(s)));
const tpSkus = new Set();
for (const d of ['tp1', 'tp3', 'tp4', 'tp5', 'tp7']) {
  const dp = path.join('build/r2-site/vi-nsg', d);
  try { for (const f of (await readdir(dp)).filter((x) => x.endsWith('.html'))) skuOf(await readFile(path.join(dp, f), 'utf8')).forEach((s) => tpSkus.add(s)); } catch {}
}
const navReach = new Set([...homeSkus, ...byCat, ...tpSkus]);
const missing = [...allSkus].filter((s) => !navReach.has(s));

console.log(`导航到不了的: ${missing.length}\n`);
for (const s of missing) {
  const p = bySku.get(s);
  console.log(`${s}`);
  console.log(`  名称     ${p?.name}`);
  console.log(`  category_ids  ${JSON.stringify(p?.category_ids)}`);
  console.log(`  in_stock ${p?.in_stock}   price ${p?.price}   url ${p?.url}`);
  console.log('');
}
