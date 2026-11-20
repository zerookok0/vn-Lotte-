/**
 * 统计实际扒到的商品规模。
 *   node scripts/count-products.mjs
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const PUBLIC = path.resolve('public');

/* 1) 有独立详情页的商品 */
const productFiles = (await readdir(path.join(PUBLIC, 'vi-nsg', 'product'))).filter((f) => f.endsWith('.html'));
const detailSkus = new Set(productFiles.map((f) => (f.match(/-(\d{8,14})-p\d+\.html$/) || [])[1]).filter(Boolean));

/* 2) 全站 HTML 里出现过的唯一商品链接 */
const allHtml = [];
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full);
    else if (e.name.endsWith('.html')) allHtml.push(full);
  }
}
await walk(PUBLIC);

const linkSkus = new Set();
const linkUrls = new Set();
for (const f of allHtml) {
  const h = await readFile(f, 'utf8');
  for (const m of h.matchAll(/href="(\/vi-nsg\/product\/[^"?#]+)"/g)) {
    const url = m[1];
    linkUrls.add(url);
    const sku = (url.match(/-(\d{8,14})-p\d+/) || [])[1];
    if (sku) linkSkus.add(sku);
  }
}

/* 3) catalog */
const catalog = JSON.parse(await readFile(path.join(PUBLIC, 'data', 'catalog.json'), 'utf8'));

/* 4) 分类页里出现的商品卡数量（每个分类首屏） */
const catFiles = (await readdir(path.join(PUBLIC, 'vi-nsg', 'category'))).filter((f) => f.endsWith('.html'));
let catCardTotal = 0;
for (const f of catFiles) {
  const h = await readFile(path.join(PUBLIC, 'vi-nsg', 'category', f), 'utf8');
  catCardTotal += new Set([...h.matchAll(/href="(\/vi-nsg\/product\/[^"?#]+)"/g)].map((m) => m[1])).size;
}

console.log('=== 实际扒到的规模 ===');
console.log(`有独立详情页的商品      : ${productFiles.length}`);
console.log(`详情页里的唯一 SKU      : ${detailSkus.size}`);
console.log(`catalog.json 商品条目   : ${catalog.products.length}`);
console.log(`全站出现过唯一商品链接  : ${linkUrls.size}`);
console.log(`全站出现过唯一 SKU      : ${linkSkus.size}`);
console.log(`分类页商品卡合计(含重复): ${catCardTotal}`);
console.log(`平均每分类首屏商品      : ${(catCardTotal / catFiles.length).toFixed(1)}`);
console.log(`分类页数量              : ${catFiles.length}`);
console.log(`HTML 总页面数           : ${allHtml.length}`);

/* 5) 原站真实总量：看抓到的分类 API 里 total_items */
try {
  const raw = await readdir('data/raw/category-api');
  const seen = new Map();
  for (const f of raw) {
    const j = JSON.parse(await readFile(path.join('data/raw/category-api', f), 'utf8'));
    const d = j.data;
    if (d && typeof d.total_items === 'number' && d.category) seen.set(String(d.category.id || d.category.name), d.total_items);
  }
  if (seen.size) {
    console.log('\n=== 原站单分类总量（来自抓到的 API 响应） ===');
    for (const [k, v] of seen) console.log(`  category ${k.padEnd(6)} total_items = ${v}`);
  }
} catch {}

/* 6) 落选的 SKU：全站链接里出现过、但没有详情页的 */
const missing = [...linkSkus].filter((s) => !detailSkus.has(s));
console.log(`\n有链接但无详情页的 SKU  : ${missing.length}`);
if (missing.length) console.log('  示例: ' + missing.slice(0, 8).join(', '));
