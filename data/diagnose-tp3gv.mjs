import { readFile } from 'node:fs/promises';

const h = await readFile('build/r2-site/vi-nsg/tp3/gia-vi-nau-an.html', 'utf8');
console.log(`页面 ${(h.length / 1024).toFixed(0)} KB\n`);

/* 1. 搜索框 */
console.log('=== 1. 搜索框 ===');
const si = h.indexOf('Tìm kiếm');
if (si > -1) {
  const seg = h.slice(Math.max(0, si - 700), si + 600);
  console.log(seg.replace(/></g, '>\n<'));
}

/* 2. 圆形分类图标 */
console.log('\n=== 2. 圆形分类图标（Gia vị nêm）===');
const gi = h.indexOf('Gia vị nêm');
if (gi > -1) {
  const seg = h.slice(Math.max(0, gi - 1100), gi + 260);
  console.log(seg.replace(/></g, '>\n<'));
}

/* 3. tab */
console.log('\n=== 3. tab（Dầu ô liu）===');
const oi = h.indexOf('Dầu ô liu');
if (oi > -1) {
  const seg = h.slice(Math.max(0, oi - 1000), oi + 300);
  console.log(seg.replace(/></g, '>\n<'));
}
