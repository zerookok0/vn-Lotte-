import { readFile } from 'node:fs/promises';
import path from 'node:path';

const CANDIDATES = [
  'build/r2-site/index.html',
  'build/r2-site/vi-nsg/tp5/sinh-nhat-lotte.html',
  'build/r2-site/vi-nsg/promotion.html',
  'build/r2-site/vi-nsg/e-catalogue.html',
];

const NEEDLES = ['Mua 1 tặng 1', 'Mua là tặng', '18 SẢN PHẨM', 'MUA LÀ CÓ QUÀ', 'ĐẠI TIỆC'];

for (const f of CANDIDATES) {
  let h;
  try { h = await readFile(f, 'utf8'); } catch { continue; }
  const hits = NEEDLES.map((n) => `${n}:${h.includes(n) ? 'Y' : '-'}`).join(' ');
  console.log(`${path.basename(f).padEnd(28)} ${hits}`);
}

/* 在 sinh-nhat-lotte 里看这个区块结构 */
const target = 'build/r2-site/vi-nsg/tp5/sinh-nhat-lotte.html';
const h = await readFile(target, 'utf8');
const i = h.indexOf('Mua 1 tặng 1');
console.log(`\nsinh-nhat-lotte 里 "Mua 1 tặng 1" 位置: ${i}`);

if (i > -1) {
  console.log('\n=== tab 附近 1500 字符 ===');
  console.log(h.slice(Math.max(0, i - 900), i + 600).replace(/></g, '>\n<').slice(0, 2200));

  /* 商品网格 */
  const after = h.slice(i, i + 8000);
  const grids = [...after.matchAll(/<div class="([^"]*(?:swiper-wrapper|row-cols|product-list)[^"]*)"/g)].slice(0, 5);
  console.log('\n=== 之后的网格容器 ===');
  grids.forEach((m) => console.log('  ' + m[1].slice(0, 80)));

  /* 商品卡父级 */
  const itemIdx = after.indexOf('<div class="item');
  if (itemIdx > -1) {
    console.log('\n=== 第一个商品卡之前的结构 ===');
    console.log(after.slice(Math.max(0, itemIdx - 800), itemIdx + 80).replace(/></g, '>\n<'));
  }
}
