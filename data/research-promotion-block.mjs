import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const CANDIDATES = [
  'build/r2-site/vi-nsg/promotion.html',
  'build/r2-site/index.html',
];

/* 找哪个页面含这个标题 */
const DIRS = ['build/r2-site'];
let target = null;
for (const c of CANDIDATES) {
  try {
    const h = await readFile(c, 'utf8');
    if (/MUA LÀ CÓ QUÀ/i.test(h)) { target = c; console.log('找到:', c); break; }
  } catch {}
}

if (!target) {
  /* 全站找一次（只在 vi-nsg 根目录，避免超时） */
  for (const f of (await readdir('build/r2-site/vi-nsg')).filter((x) => x.endsWith('.html'))) {
    const p = path.join('build/r2-site/vi-nsg', f);
    const h = await readFile(p, 'utf8');
    if (/MUA LÀ CÓ QUÀ/i.test(h)) { target = p; console.log('找到:', p); break; }
  }
}

if (!target) { console.log('没找到该区块'); process.exit(0); }

const h = await readFile(target, 'utf8');
const idx = h.search(/MUA LÀ CÓ QUÀ/i);

/* 往前找最近的开区块容器，往后找商品网格 */
const before = h.slice(Math.max(0, idx - 1200), idx);
const after = h.slice(idx, idx + 4000);

console.log('\n=== 标题前的容器 ===');
const containers = [...before.matchAll(/<div class="([^"]*(?:row|block|section|tab)[^"]*)"/g)].slice(-6);
containers.forEach((m) => console.log('  ' + m[1].slice(0, 100)));

console.log('\n=== 标题后 4000 字符（找商品网格）===');
const gridInAfter = [...after.matchAll(/<div class="([^"]*(?:row-cols|swiper-wrapper|grid)[^"]*)"/g)].slice(0, 6);
gridInAfter.forEach((m) => console.log('  ' + m[1].slice(0, 100)));

/* 商品卡结构 */
const firstItem = after.search(/<div class="item/);
if (firstItem > -1) {
  console.log('\n=== 第一个商品卡前 600 字符 ===');
  console.log(after.slice(Math.max(0, firstItem - 600), firstItem + 200).replace(/></g, '>\n<'));
}

/* tab 结构 */
const tabIdx = after.search(/Mua 1 tặng 1|Mua là tặng/i);
if (tabIdx > -1) {
  console.log('\n=== tab 结构 ===');
  console.log(after.slice(Math.max(0, tabIdx - 500), tabIdx + 600).replace(/></g, '>\n<'));
}
