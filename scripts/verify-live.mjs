/**
 * 线上验证：抓每个页面的 404 / 破图 / 空白块
 *   node scripts/verify-live.mjs [baseUrl]
 */
import { chromium } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.argv[2] || 'https://vn-lotte.pages.dev';

const PAGES = [
  ['首页', '/'],
  ['分类', '/vi-nsg/category/rau-cu-c3'],
  ['商品(真实快照)', '/vi-nsg/product/chanh-khong-hat-500g-8935268200836-p228894'],
  ['商品(模板渲染)', '/vi-nsg/product/nam-mo-trang-uc-200g-9337441000025-9337441000025-p71479'],
  ['专题页', '/vi-nsg/tp5/pet-shop'],
  ['静态页', '/vi-nsg/about-us'],
  ['购物车', '/cart'],
  ['结账', '/checkout'],
  ['搜索', '/search?q=nam'],
];

const results = [];
const ok = (n, p, d = '') => { results.push({ n, p }); console.log(`  ${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });

for (const [label, path] of PAGES) {
  const page = await ctx.newPage();
  const bad = [];
  page.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url().replace(BASE, '').slice(0, 70)}`); });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));

  try {
    const res = await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(1500);
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 30)); }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(1000);

    const info = await page.evaluate(() => {
      const imgs = [...document.querySelectorAll('img')];
      return {
        broken: imgs.filter((i) => i.complete && i.naturalWidth === 0 && i.getAttribute('src')).length,
        overflow: document.documentElement.scrollWidth > window.innerWidth + 2,
        h: document.body.scrollHeight,
      };
    });

    ok(`${label.padEnd(14)} ${res.status()}`, res.status() === 200 && bad.length === 0 && info.broken === 0 && !info.overflow,
      `404=${bad.length} brokenImg=${info.broken} overflow=${info.overflow} h=${info.h}${errs.length ? ' jsErr=' + errs.length : ''}`);
    if (bad.length) bad.slice(0, 3).forEach((b) => console.log(`       ${b}`));
  } catch (e) {
    ok(`${label} 加载失败`, false, String(e).slice(0, 80));
  } finally {
    await page.close();
  }
}

await browser.close();
const failed = results.filter((r) => !r.p);
console.log(`\n=== ${results.length - failed.length}/${results.length} 页面正常 ===`);
if (failed.length) process.exitCode = 1;
