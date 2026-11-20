/**
 * 把 products-full.json 按 SKU 前两位分片，供商品页按需加载。
 *   node scripts/shard-products.mjs
 *
 * 输出：public/data/p/<prefix>.json   （每个约 150–250 KB）
 */
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('.');
const PUBLIC = path.join(ROOT, 'public');
const SRC = path.join(PUBLIC, 'data', 'products-full.json');

const raw = JSON.parse(await readFile(SRC, 'utf8'));
const out = path.join(PUBLIC, 'data', 'p');
await mkdir(out, { recursive: true });

const buckets = new Map();
for (const p of raw.products) {
  const key = String(p.sku || '').slice(0, 2) || 'xx';
  if (!buckets.has(key)) buckets.set(key, []);
  buckets.get(key).push({
    sku: p.sku,
    name: p.name,
    url: p.url,
    price: p.price,
    special_price: p.special_price,
    price_formatted: p.price_formatted,
    special_price_formatted: p.special_price_formatted,
    image: p.image,
    image_big: p.image_big,
    stock_qty: p.stock_qty,
    in_stock: p.in_stock,
    unit: p.unit,
    vendor: p.vendor,
    usage_notes: p.usage_notes,
    short_description: p.short_description,
    rating: p.rating,
    reviews: p.reviews,
  });
}

let bytes = 0;
for (const [k, list] of buckets) {
  const body = JSON.stringify({ prefix: k, products: list });
  await writeFile(path.join(out, `${k}.json`), body, 'utf8');
  bytes += body.length;
}
console.log(`shards=${buckets.size} total=${raw.products.length} size=${(bytes / 1024 / 1024).toFixed(1)} MB`);
console.log(`平均每片 ${(bytes / buckets.size / 1024).toFixed(0)} KB`);

/* 顺便生成一个 sku → 分片前缀 的索引，供服务端/前端快速定位 */
const index = {};
for (const p of raw.products) index[p.sku] = String(p.sku).slice(0, 2);
await writeFile(path.join(PUBLIC, 'data', 'product-index.json'), JSON.stringify(index), 'utf8');
console.log(`index: ${Object.keys(index).length} sku -> ${((JSON.stringify(index).length) / 1024 / 1024).toFixed(1)} MB`);
