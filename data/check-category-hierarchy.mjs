import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const cat = JSON.parse(await readFile('public/data/catalog.json', 'utf8'));
const cats = cat.categoriesFlat || cat.categories;
const products = JSON.parse(await readFile('public/data/products-full.json', 'utf8')).products;

const byId = new Map(cats.map((c) => [String(c.id), c]));
const children = new Map();
for (const c of cats) {
  const p = String(c.parent_id || '');
  if (!children.has(p)) children.set(p, []);
  children.get(p).push(String(c.id));
}

const direct = new Map();
for (const p of products) {
  for (const id of (p.category_ids || [])) {
    const k = String(id);
    direct.set(k, (direct.get(k) || 0) + 1);
  }
}

function withDescendants(id, seen = new Set()) {
  if (seen.has(id)) return 0;
  seen.add(id);
  let n = direct.get(id) || 0;
  for (const ch of children.get(id) || []) n += withDescendants(ch, seen);
  return n;
}

/* 拿几个分类页对比：快照里有多少商品 vs 数据里能算出多少 */
const DIR = 'build/r2-site/vi-nsg/category';
const files = (await readdir(DIR)).filter((f) => f.endsWith('.html'));

console.log('slug'.padEnd(42), '快照', '直接', '含子分类');
for (const f of files.slice(0, 12)) {
  const h = await readFile(path.join(DIR, f), 'utf8');
  const snap = new Set([...h.matchAll(/-(\d{8,14})(?:-\d{8,14})?-p\d+/g)].map((m) => m[1]));
  const m = f.match(/-c(\d+)\.html$/);
  if (!m) continue;
  const id = m[1];
  const d = direct.get(id) || 0;
  const w = withDescendants(id);
  console.log(f.replace('.html', '').slice(0, 40).padEnd(42), String(snap.size).padStart(4), String(d).padStart(6), String(w).padStart(8), d > 50 || w > 50 ? '  ← 可加 Xem thêm' : '');
}

/* 全局：有多少分类能凑出超过 50 个 */
let over50 = 0, over100 = 0, over500 = 0;
for (const c of cats) {
  const w = withDescendants(String(c.id), new Set());
  if (w > 50) over50++;
  if (w > 100) over100++;
  if (w > 500) over500++;
}
console.log(`\n含子分类后商品数 >50 的分类: ${over50} / ${cats.length}`);
console.log(`>100: ${over100}   >500: ${over500}`);
