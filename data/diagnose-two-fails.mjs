import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const DIR = path.join('build', 'r2-site', 'vi-nsg', 'product');
const pair = [
  'bot-an-dam-ridielac-gold-heo-ca-rot-200g-8934673424035-8934673424035-p7104',
  'bad-ridielac-gold-heo-ca-rot-hg-200g-8934673400718-8934673400718-p238694',
];

for (const slug of pair) {
  const f = path.join(DIR, `${slug}.html`);
  const st = await stat(f).catch(() => null);
  console.log(`\n=== ${slug}.html ===`);
  console.log(`  exists: ${!!st}   size: ${st ? (st.size / 1024).toFixed(0) + ' KB' : '-'}`);
  if (!st) continue;
  const h = await readFile(f, 'utf8');
  const title = (h.match(/<title>([^<]*)/) || [])[1];
  const h2 = (h.match(/<h2[^>]*>([^<]*)/) || [])[1];
  const imgs = [...new Set([...h.matchAll(/cache\/0x0\/([^"')]+)/g)].map((m) => m[1]))].slice(0, 3);
  const price = (h.match(/field-price[^>]*>[\s\S]{0,80}?(\d[\d.]*)\s*₫/) || [])[1];
  const skuInPage = [...new Set([...h.matchAll(/(\d{13})/g)].map((m) => m[1]))].slice(0, 4);
  console.log(`  title: ${title}`);
  console.log(`  h2:    ${h2}`);
  console.log(`  价格:  ${price}`);
  console.log(`  图:    ${imgs.join(' | ')}`);
  console.log(`  页面里的 13 位数字: ${skuInPage.join(', ')}`);
}

/* 无加购按钮那个 */
console.log('\n\n=== 无加购按钮的商品页 ===');
const f2 = path.join(DIR, 'cl-banh-qui-dua-socola-158g-8934609802388-8934609802388-p234232.html');
const st2 = await stat(f2).catch(() => null);
console.log(`  exists: ${!!st2}  size: ${st2 ? (st2.size / 1024).toFixed(0) + ' KB' : '-'}`);
if (st2) {
  const h = await readFile(f2, 'utf8');
  const btn = h.match(/<button[^>]*title="Thêm vào giỏ[^"]*"[^>]*>/);
  console.log(`  加购按钮: ${btn ? btn[0].slice(0, 120) : 'NOT FOUND'}`);
  for (const kw of ['Hết hàng', 'hết hàng', 'Liên hệ', 'Tạm hết', 'out of stock', 'btn-primary']) {
    const i = h.indexOf(kw);
    if (i > -1) console.log(`  命中 "${kw}" @${i}: ${h.slice(Math.max(0, i - 100), i + 120).replace(/\s+/g, ' ').slice(0, 220)}`);
  }
}
