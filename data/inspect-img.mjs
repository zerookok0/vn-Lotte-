import { readFile } from 'node:fs/promises';

const h = await readFile('public/index.html', 'utf8');

const show = (label, start, len = 1200) => {
  console.log(`\n=== ${label} ===`);
  console.log(h.slice(start, start + len));
};

// 首页第一个 swiper banner
const i = h.indexOf('swiper-slide');
console.log('=== banner area (raw, 1600 chars) ===');
console.log(h.slice(Math.max(0, i - 600), i + 1600));

// 图片占位 span 的精确写法
const j = h.indexOf('object-fit: cover');
console.log('\n=== image span raw ===');
console.log(JSON.stringify(h.slice(j - 260, j + 120)));

console.log('\n=== stats ===');
console.log('img tags:', (h.match(/<img\b/g) || []).length);
console.log('object-fit: cover spans:', (h.match(/object-fit: cover/g) || []).length);
console.log('placeholder-glow:', (h.match(/placeholder-glow/g) || []).length);
console.log('swiper-slide:', (h.match(/swiper-slide/g) || []).length);
