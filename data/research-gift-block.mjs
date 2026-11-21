import { readFile } from 'node:fs/promises';

const h = await readFile('build/r2-site/index.html', 'utf8');

/* 找 MUA LÀ CÓ QUÀ 区块 */
const idx = h.search(/MUA LÀ CÓ QUÀ/i);
console.log('区块位置:', idx);
if (idx > -1) {
  const seg = h.slice(idx, idx + 3000);
  console.log('\n=== 区块开头 3000 字符 ===');
  console.log(seg.replace(/></g, '>\n<').slice(0, 2600));
}

/* 找所有商品容器的 class 组合 */
console.log('\n\n=== 商品网格 class 统计 ===');
const grids = new Map();
for (const m of h.matchAll(/<div class="([^"]*(?:row|grid|swiper-wrapper)[^"]*)"/g)) {
  const cls = m[1];
  grids.set(cls, (grids.get(cls) || 0) + 1);
}
[...grids.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([k, v]) => console.log(`  ${String(v).padStart(3)}  ${k.slice(0, 90)}`));

/* 商品卡的父容器 class */
console.log('\n=== 商品卡 .item 的父级 class ===');
const parents = new Map();
const re = /<div class="([^"]*)">\s*<div class="([^"]*)">\s*<div class="item"/g;
let m;
while ((m = re.exec(h))) {
  const key = `outer=${m[1]} inner=${m[2]}`;
  parents.set(key, (parents.get(key) || 0) + 1);
}
[...parents.entries()].slice(0, 10).forEach(([k, v]) => console.log(`  ${String(v).padStart(3)}  ${k.slice(0, 110)}`));
