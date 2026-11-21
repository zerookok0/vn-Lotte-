import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const PRODUCTS = JSON.parse(await readFile('public/data/products-full.json', 'utf8')).products;
const total = new Set(PRODUCTS.map((p) => String(p.sku)));
console.log(`全站唯一商品: ${total.size}`);

/* 首页里露出多少个 */
const home = await readFile('build/r2-site/index.html', 'utf8');
const homeSkus = new Set([...home.matchAll(/-(\d{8,14})(?:-\d{8,14})?-p\d+/g)].map((m) => m[1]));
console.log(`首页 index.html 露出的商品: ${homeSkus.size}`);

/* 分类页里一共露出多少个（去重） */
const DIR = 'build/r2-site/vi-nsg/category';
const files = (await readdir(DIR)).filter((f) => f.endsWith('.html'));
const catSkus = new Set();
let perCat = [];
for (const f of files) {
  const h = await readFile(path.join(DIR, f), 'utf8');
  const skus = new Set([...h.matchAll(/-(\d{8,14})(?:-\d{8,14})?-p\d+/g)].map((m) => m[1]));
  perCat.push({ f, n: skus.size });
  skus.forEach((s) => catSkus.add(s));
}
perCat.sort((a, b) => b.n - a.n);
console.log(`分类页数量: ${files.length}`);
console.log(`分类页里出现的唯一商品（去重）: ${catSkus.size}`);
console.log(`分类页商品数 中位数/最大/最小: ${perCat[Math.floor(perCat.length / 2)].n} / ${perCat[0].n} / ${perCat[perCat.length - 1].n}`);
console.log('商品最多的 5 个分类:');
perCat.slice(0, 5).forEach((c) => console.log(`  ${String(c.n).padStart(4)}  ${c.f}`));

/* 专题页露出 */
const TP = 'build/r2-site/vi-nsg';
const tpDirs = ['tp3', 'tp4', 'tp5', 'tp7'];
const tpSkus = new Set();
for (const d of tpDirs) {
  const dp = path.join(TP, d);
  for (const f of (await readdir(dp)).filter((x) => x.endsWith('.html'))) {
    const h = await readFile(path.join(dp, f), 'utf8');
    [...h.matchAll(/-(\d{8,14})(?:-\d{8,14})?-p\d+/g)].forEach((m) => tpSkus.add(m[1]));
  }
}
console.log(`专题页里出现的唯一商品: ${tpSkus.size}`);

/* 全站页面数 */
const allProductPages = (await readdir('build/r2-site/vi-nsg/product')).filter((f) => f.endsWith('.html'));
console.log(`\n独立商品详情页文件数: ${allProductPages.length}`);

/* 覆盖率：分类+首页+专题 能触达多少 */
const reachable = new Set([...homeSkus, ...catSkus, ...tpSkus]);
console.log(`首页+分类+专题 合计触达（去重）: ${reachable.size}  占全站 ${((reachable.size / total.size) * 100).toFixed(1)}%`);
console.log(`剩下只能靠搜索/直达 URL 到达: ${total.size - reachable.size}`);
