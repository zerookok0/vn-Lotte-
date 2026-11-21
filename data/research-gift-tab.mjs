import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const NEEDLE = 'Mua 1 tặng 1';

async function walk(dir, rel = '', out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) await walk(full, r, out);
    else if (e.name.endsWith('.html')) out.push({ full, rel: r });
  }
  return out;
}

const files = await walk('build/r2-site');
console.log(`扫描 ${files.length} 个页面…`);

const hits = [];
for (const f of files) {
  const h = await readFile(f.full, 'utf8');
  if (h.includes(NEEDLE)) hits.push(f.rel);
}
console.log(`含「${NEEDLE}」的页面: ${hits.length}`);
hits.slice(0, 10).forEach((h) => console.log('  ' + h));

if (!hits.length) process.exit(0);

/* 分析第一个命中页面的该区块 */
const target = path.join('build/r2-site', hits[0]);
const h = await readFile(target, 'utf8');
const idx = h.indexOf(NEEDLE);

console.log(`\n=== ${hits[0]} 的区块结构 ===`);
const around = h.slice(Math.max(0, idx - 2000), idx + 2500);

/* 找商品网格 */
const grids = [...around.matchAll(/<div class="([^"]*(?:row-cols|swiper-wrapper)[^"]*)"/g)];
console.log('\n网格 class:');
grids.slice(0, 8).forEach((m) => console.log('  ' + m[1].slice(0, 90)));

/* tab 结构 */
console.log('\n=== tab 附近 ===');
console.log(around.slice(2000 - 500, 2000 + 700).replace(/></g, '>\n<').slice(0, 1400));

/* 商品卡 */
const itemIdx = h.indexOf('<div class="item', idx);
if (itemIdx > -1) {
  console.log('\n=== 该区块第一个商品卡（前 500 字符的父级 + 卡头）===');
  console.log(h.slice(Math.max(0, itemIdx - 500), itemIdx + 300).replace(/></g, '>\n<'));
}
