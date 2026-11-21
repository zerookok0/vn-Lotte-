import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const full = JSON.parse(await readFile('public/data/products-full.json', 'utf8')).products;
const allSkus = new Set(full.map((p) => String(p.sku)));
console.log(`全站商品: ${allSkus.size}\n`);

const skuOf = (h) => new Set([...h.matchAll(/-(\d{8,14})(?:-\d{8,14})?-p\d+/g)].map((m) => m[1]));

/* ① 首页 */
const homeSkus = skuOf(await readFile('build/r2-site/index.html', 'utf8'));
console.log(`① 首页 index.html 露出          ${String(homeSkus.size).padStart(5)}`);

/* ② 分类：Xem thêm 能加载到的全部（cat-index） */
const catIndex = JSON.parse(await readFile('public/data/cat-index.json', 'utf8'));
const byCat = new Set();
let refs = 0;
for (const [k, v] of Object.entries(catIndex)) {
  if (k === '_meta') continue;
  for (const s of v) { byCat.add(String(s)); refs++; }
}
console.log(`② 分类页「Xem thêm」后可点到       ${String(byCat.size).padStart(5)}   （${Object.keys(catIndex).length - 1} 个分类，${refs} 条引用）`);

/* ③ 专题页 */
const TP = 'build/r2-site/vi-nsg';
const tpSkus = new Set();
for (const d of ['tp1', 'tp3', 'tp4', 'tp5', 'tp7']) {
  const dp = path.join(TP, d);
  try {
    for (const f of (await readdir(dp)).filter((x) => x.endsWith('.html'))) {
      skuOf(await readFile(path.join(dp, f), 'utf8')).forEach((s) => tpSkus.add(s));
    }
  } catch { }
}
console.log(`③ 专题页露出                     ${String(tpSkus.size).padStart(5)}`);

/* ④ 搜索索引 */
const searchIndex = JSON.parse(await readFile('public/data/search-index.json', 'utf8'));
const searchSkus = new Set(searchIndex.map((r) => String(r[0])));
console.log(`④ 站内搜索可搜到                 ${String(searchSkus.size).padStart(5)}`);

/* 合计 */
const navReach = new Set([...homeSkus, ...byCat, ...tpSkus]);
const anyReach = new Set([...navReach, ...searchSkus]);
console.log(`\n导航可达（首页+分类+专题）       ${String(navReach.size).padStart(5)}   ${((navReach.size / allSkus.size) * 100).toFixed(1)}%`);
console.log(`含搜索在内可达                   ${String(anyReach.size).padStart(5)}   ${((anyReach.size / allSkus.size) * 100).toFixed(1)}%`);

/* 差集 */
const missingNav = [...allSkus].filter((s) => !navReach.has(s));
const missingAll = [...allSkus].filter((s) => !anyReach.has(s));
console.log(`\n仅靠搜索才能到                   ${missingNav.length}`);
console.log(`完全到不了（连搜索也没有）        ${missingAll.length}`);
if (missingAll.length) {
  console.log('  清单（前 10）:');
  missingAll.slice(0, 10).forEach((s) => {
    const p = full.find((x) => String(x.sku) === s);
    console.log(`    ${s}  ${p?.name?.slice(0, 40) || ''}`);
  });
}

/* 反查：cat-index 里指向不存在的 SKU（坏链） */
const badRefs = [...byCat].filter((s) => !allSkus.has(s));
console.log(`\ncat-index 里指向不存在商品的 SKU: ${badRefs.length}`);
badRefs.slice(0, 5).forEach((s) => console.log('  ' + s));
