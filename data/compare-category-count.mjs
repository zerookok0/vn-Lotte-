import { readFile } from 'node:fs/promises';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0';

/* 对比：原站分类页第一屏商品数 vs 克隆站 */
const cats = [
  ['dau-an-c201', 'https://www.lottemart.vn/vi-nsg/category/dau-an-c201'],
  ['banh-an-sang-c524', 'https://www.lottemart.vn/vi-nsg/category/banh-an-sang-c524'],
];

for (const [slug, url] of cats) {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' } });
  const html = await res.text();
  const skus = new Set([...html.matchAll(/-(\d{8,14})(?:-\d{8,14})?-p\d+/g)].map((m) => m[1]));
  const hasMore = /Xem thêm|Xem thêm sản phẩm|load\s*more/i.test(html);
  console.log(`\n=== 原站 ${slug} ===`);
  console.log(`  status: ${res.status}  html: ${(html.length / 1024).toFixed(0)} KB`);
  console.log(`  首屏商品（去重 sku）: ${skus.size}`);
  console.log(`  含「Xem thêm」: ${hasMore}`);

  try {
    const local = await readFile(`build/r2-site/vi-nsg/category/${slug}.html`, 'utf8');
    const lskus = new Set([...local.matchAll(/-(\d{8,14})(?:-\d{8,14})?-p\d+/g)].map((m) => m[1]));
    console.log(`  克隆站同页商品: ${lskus.size}`);
  } catch { }
}
