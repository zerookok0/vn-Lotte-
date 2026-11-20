import { readFile } from 'node:fs/promises';

const h = await readFile('public/product.html', 'utf8');

console.log('=== 关键区块 class（按出现顺序）===');
const seen = new Set();
for (const m of h.matchAll(/<(\w+)[^>]*class="([^"]+)"[^>]*>/g)) {
  const cls = m[2].split(/\s+/).filter((c) => /product|price|name|desc|gallery|img|slide|title|info|detail|breadcrumb|tab|review/i.test(c)).join(' ');
  if (!cls || seen.has(cls)) continue;
  seen.add(cls);
  if (seen.size > 45) break;
  console.log(`  <${m[1]}> .${cls}`);
}

console.log('\n=== 标题/价格/图 的候选 ===');
for (const sel of ['<h1', 'class="product-name', 'class="field-price', 'product-img-slide', 'scrollspyProductdetail', 'breadcrumb']) {
  const i = h.indexOf(sel);
  console.log(`\n--- ${sel} (idx ${i}) ---`);
  if (i > -1) console.log(h.slice(Math.max(0, i - 200), i + 320).replace(/\s+/g, ' ').slice(0, 480));
}
