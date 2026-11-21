/**
 * 生成 card-data.json：商品卡渲染所需的精简字段（供「Xem thêm」追加时用）
 *   node scripts/build-card-data.mjs
 *
 * 体积控制：字段名缩写，去掉描述类长文本。
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('.');
const dir = path.join(ROOT, 'public', 'data');

const catIndex = JSON.parse(await readFile(path.join(dir, 'cat-index.json'), 'utf8'));
const used = new Set();
for (const [k, v] of Object.entries(catIndex)) {
  if (k === '_meta') continue;
  for (const sku of v) used.add(String(sku));
}
console.log(`cat-index 里的唯一 SKU: ${used.size}`);

const full = JSON.parse(await readFile(path.join(dir, 'products-full.json'), 'utf8')).products;
const bySku = new Map(full.map((p) => [String(p.sku), p]));

const out = {};
let missing = 0;
for (const sku of used) {
  const p = bySku.get(sku);
  if (!p) { missing++; continue; }
  out[sku] = {
    n: p.name || '',
    u: p.url || '',
    p: p.special_price || p.price || 0,        // 折后价
    o: p.price || 0,                            // 原价
    i: p.image || p.thumb || '',
    r: p.rating || 0,
    v: p.reviews || 0,
    w: p.ext_viewed || p.viewed || 0,
    s: p.in_stock === false ? 0 : 1,
    d: p.unit || '',
  };
}

const dest = path.join(dir, 'card-data.json');
const json = JSON.stringify(out);
await writeFile(dest, json, 'utf8');

console.log(`写入 card-data.json: ${(json.length / 1024 / 1024).toFixed(2)} MB，${Object.keys(out).length} 个商品`);
console.log(`cat-index 里找不到对应商品的 SKU: ${missing}`);

/* 统计 */
const prices = Object.values(out).map((x) => x.p).filter(Boolean);
const bad = prices.filter((x) => x % 100 !== 0);
console.log(`价格不是整百的: ${bad.length} / ${prices.length}`);
