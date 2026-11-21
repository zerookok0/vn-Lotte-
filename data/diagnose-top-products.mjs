import { readFile } from 'node:fs/promises';

const h = await readFile('build/r2-site/index.html', 'utf8');

/* 定位 section.top-products */
const start = h.indexOf('class="section top-products"');
console.log('section.top-products 位置:', start);

/* 找下一个 section 作为边界 */
const nextSection = h.indexOf('class="section ', start + 30);
const seg = h.slice(start, nextSection > -1 ? nextSection : start + 30000);
console.log('区块长度:', seg.length, '字符');

console.log('\n=== 区块内所有容器 class（去重）===');
const classes = new Map();
for (const m of seg.matchAll(/<div class="([^"]+)"/g)) {
  const c = m[1];
  classes.set(c, (classes.get(c) || 0) + 1);
}
[...classes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).forEach(([k, v]) => console.log(`  ${String(v).padStart(3)}  ${k.slice(0, 80)}`));

/* 商品卡在哪 */
const itemIdx = seg.indexOf('class="item');
console.log('\n=== 第一个 .item 之前 700 字符（看容器层级）===');
if (itemIdx > -1) console.log(seg.slice(Math.max(0, itemIdx - 700), itemIdx + 100).replace(/></g, '>\n<'));

/* 区块尾部结构 */
console.log('\n=== 区块最后 800 字符 ===');
console.log(seg.slice(-800).replace(/></g, '>\n<'));
