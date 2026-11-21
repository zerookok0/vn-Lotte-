import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0';
const slug = 'bia-larue-4-2-abv-thung-24-lon-x-330ml-8934822904333-8934822904333-p10626';
const local = path.join('build', 'r2-site', 'vi-nsg', 'product', `${slug}.html`);

const st = await stat(local).catch(() => null);
console.log(`本地文件: ${st ? (st.size / 1024).toFixed(0) + ' KB' : '缺失'}`);
if (st) {
  const h = await readFile(local, 'utf8');
  const title = (h.match(/<title>([^<]*)/) || [])[1];
  console.log(`  title: ${title}`);
  console.log(`  含 8934822904333: ${h.includes('8934822904333')}`);
  console.log(`  含 field-price: ${h.includes('field-price')}`);
  for (const kw of ['tuổi', 'Tuổi', '18+', 'rượu', 'bia', 'Xác nhận', 'age', 'alcohol']) {
    const i = h.indexOf(kw);
    if (i > -1) { console.log(`  命中 "${kw}" @${i}: ${h.slice(Math.max(0, i - 80), i + 100).replace(/\s+/g, ' ').slice(0, 200)}`); break; }
  }
  const bodyText = h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 600);
  console.log(`  正文开头: ${bodyText.slice(0, 300)}`);
}

console.log('\n=== 原站响应 ===');
const url = `https://www.lottemart.vn/vi-nsg/product/${slug.replace(/-p\d+$/, '')}-p10626`;
console.log('  URL:', url);
try {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' }, redirect: 'manual' });
  console.log('  status:', res.status, '| location:', res.headers.get('location') || '(none)');
  const html = await res.text();
  console.log('  len:', html.length);
  const t = (html.match(/<title>([^<]*)/) || [])[1] || '';
  console.log('  title:', t);
  console.log('  含 sku:', html.includes('8934822904333'));
  console.log('  含 field-price:', html.includes('field-price'));
  for (const kw of ['tuổi', 'Tuổi', 'rượu', 'Xác nhận']) {
    const i = html.indexOf(kw);
    if (i > -1) { console.log(`  命中 "${kw}": ${html.slice(Math.max(0, i - 100), i + 140).replace(/\s+/g, ' ').slice(0, 220)}`); break; }
  }
} catch (e) {
  console.log('  ERR:', String(e).slice(0, 80));
}
