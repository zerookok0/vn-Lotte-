import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const h = await readFile('public/vi-nsg/tp5/sinh-nhat-lotte.html', 'utf8');
const leftover = (h.match(/href="\/vi-nsg\/product\/\d{8,14}"/g) || []).length;
console.log('该页剩余残缺链接:', leftover);

const rows = [];
const re = /<a\b([^>]*href="\/vi-nsg\/product\/[^"]+"[^>]*)>\s*<img\b([^>]*)>/g;
let m;
while ((m = re.exec(h)) && rows.length < 10) {
  const href = (m[1].match(/href="([^"]*)"/) || [])[1];
  const src = (m[2].match(/src="([^"]*)"/) || [])[1] || '';
  rows.push({ href, img: src.slice(-44) });
}
console.log(`banner 商品链接 ${rows.length} 个：`);
rows.forEach((r) => console.log('  ' + r.href));

const uniq = new Set(rows.map((r) => r.href));
console.log(`唯一链接: ${uniq.size} / ${rows.length}`);

/* 浏览器实测：点前两个 banner，看落到哪个商品 */
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
const page = await ctx.newPage();

const visited = [];
for (const target of rows.slice(0, 3)) {
  await page.goto('http://127.0.0.1:8787' + target.href, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(1800);
  const info = await page.evaluate(() => ({
    title: document.title,
    h2: document.querySelector('.product-custom h2')?.textContent?.trim(),
    price: document.querySelector('.product-custom .field-price')?.textContent?.replace(/\s+/g, ' ').trim(),
    img: document.querySelector('.swiper-gallery img')?.getAttribute('src')?.slice(-40),
  }));
  visited.push(info);
  console.log(`\n${target.href}\n  -> ${JSON.stringify(info)}`);
}

const titles = visited.map((v) => v.h2 || v.title);
const uniqueTitles = new Set(titles);
console.log(`\n落地商品标题唯一数: ${uniqueTitles.size} / ${titles.length}`);
console.log(uniqueTitles.size >= Math.min(2, titles.length) ? '  ✓ 不同 banner 落到不同商品' : '  ✗ 仍然都落到同一个商品');

await browser.close();
