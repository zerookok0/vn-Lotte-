import { readFile } from 'node:fs/promises';

const h = await readFile('public/index.html', 'utf8');
const idx = h.indexOf('btn-cart');
console.log('=== around first btn-cart ===');
console.log(h.slice(Math.max(0, idx - 1200), idx + 400).replace(/></g, '>\n<'));

const idx2 = h.indexOf('class="item-product');
console.log('\n=== item-product ===', idx2);
if (idx2 > -1) console.log(h.slice(idx2 - 200, idx2 + 2500).replace(/></g, '>\n<').slice(0, 3000));

// 头部购物车图标
const i3 = h.indexOf('header-cart');
console.log('\n=== header-cart ===', i3);
if (i3 > -1) console.log(h.slice(i3 - 300, i3 + 700).replace(/></g, '>\n<'));

// 找可能的商品卡容器 class
const classes = new Set();
for (const m of h.matchAll(/class="([^"]+)"/g)) {
  for (const c of m[1].split(/\s+/)) {
    if (/product|card|item|price|title|thumb|image/i.test(c)) classes.add(c);
  }
}
console.log('\n=== candidate classes (first 60) ===');
console.log([...classes].slice(0, 60).join('\n'));
