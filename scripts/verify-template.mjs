/**
 * 验证「没有快照的商品」走模板 + 数据渲染后是否正确
 *   node scripts/verify-template.mjs
 */
import { chromium } from 'playwright-core';
import { readFile, readdir } from 'node:fs/promises';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:8787';

const full = JSON.parse(await readFile('public/data/products-full.json', 'utf8'));
const have = new Set((await readdir('public/vi-nsg/product')).map((f) => f.replace(/\.html$/, '')));

const pick = (n) => full.products.filter((p) => !have.has(p.url.split('/').pop())).slice(0, n);
const samples = pick(3);
samples.forEach((p) => console.log(`  样本: ${p.url}\n        ${p.name} | ${p.price} | ${p.image.slice(-40)}`));

const results = [];
const ok = (n, p, d = '') => { results.push({ n, p }); console.log(`  ${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });

for (const p of samples) {
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
  await page.goto(BASE + p.url, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(2000);

  const got = await page.evaluate(() => ({
    title: document.title,
    h2: (document.querySelector('.product-custom h2') || {}).textContent?.trim(),
    price: (document.querySelector('.product-custom .field-price') || {}).textContent?.trim(),
    img: (document.querySelector('.swiper-gallery img') || {}).getAttribute?.('src'),
    addBtn: !!document.querySelector('button[title="Thêm vào giỏ hàng"]'),
  }));

  const nameOk = (got.h2 || '').indexOf(p.name.slice(0, 20)) > -1 || (got.title || '').indexOf(p.name.slice(0, 20)) > -1;
  const priceOk = String(got.price || '').replace(/[^\d]/g, '') !== '' ;
  const imgOk = (got.img || '').indexOf(p.image.split('/').pop().split('-')[0]) > -1 || (got.img || '').indexOf(p.sku) > -1;

  ok(`标题渲染正确: ${p.name.slice(0, 34)}`, nameOk, got.title.slice(0, 50));
  ok(`价格有值`, priceOk, got.price);
  ok(`主图换成该商品`, imgOk, (got.img || '').slice(-46));
  ok(`加购按钮在`, got.addBtn);
  ok(`无 JS 异常`, errs.length === 0, errs[0] || '');

  await page.close();
}

await browser.close();
const failed = results.filter((r) => !r.p);
console.log(`\n=== ${results.length - failed.length}/${results.length} passed ===`);
if (failed.length) process.exitCode = 1;
