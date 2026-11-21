import { readFile } from 'node:fs/promises';

const full = JSON.parse(await readFile('public/data/products-full.json', 'utf8'));
const list = full.products;

console.log(`商品总数: ${list.length}`);

/* 1. SKU 唯一性 */
const skuMap = new Map();
for (const p of list) {
  const s = String(p.sku);
  if (!skuMap.has(s)) skuMap.set(s, []);
  skuMap.get(s).push(p);
}
const dupSku = [...skuMap.entries()].filter(([, v]) => v.length > 1);
console.log(`唯一 SKU: ${skuMap.size}  |  重复 SKU: ${dupSku.length}`);

/* 2. URL 唯一性 */
const urlMap = new Map();
for (const p of list) {
  const u = String(p.url || '');
  if (!u) continue;
  if (!urlMap.has(u)) urlMap.set(u, []);
  urlMap.get(u).push(String(p.sku));
}
const dupUrl = [...urlMap.entries()].filter(([, v]) => v.length > 1);
console.log(`唯一 URL: ${urlMap.size}  |  URL 冲突: ${dupUrl.length}`);
if (dupUrl.length) {
  console.log('  URL 冲突示例:');
  dupUrl.slice(0, 5).forEach(([u, skus]) => console.log(`    ${u}  <- SKUs: ${skus.join(', ')}`));
}

/* 3. 同名不同 SKU（变体） */
const nameMap = new Map();
for (const p of list) {
  const n = String(p.name || '').trim().toLowerCase();
  if (!n) continue;
  if (!nameMap.has(n)) nameMap.set(n, []);
  nameMap.get(n).push({ sku: String(p.sku), id: p.id, url: p.url, price: p.price });
}
const variants = [...nameMap.entries()].filter(([, v]) => v.length > 1);
console.log(`同名多 SKU（变体）: ${variants.length} 组`);
variants.slice(0, 5).forEach(([n, v]) => {
  console.log(`  "${n.slice(0, 40)}"  ${v.length} 个 SKU`);
  v.slice(0, 3).forEach((x) => console.log(`     ${x.sku}  id=${x.id}  ${x.url}`));
});

/* 4. 变体的 SKU 是否都在列表里 */
let totalVariantSkus = 0;
for (const [, v] of variants) totalVariantSkus += v.length;
console.log(`变体涉及的商品条目: ${totalVariantSkus}`);

/* 5. 有没有 configurable / bundle 类型（子 SKU） */
const byType = {};
for (const p of list) byType[p.type_id || 'unknown'] = (byType[p.type_id || 'unknown'] || 0) + 1;
console.log('type_id 分布:', JSON.stringify(byType));
