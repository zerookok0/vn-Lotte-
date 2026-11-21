import { chromium } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const HOST = 'https://www.lottemart.vn';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 }, locale: 'vi-VN',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
});
const page = await ctx.newPage();
await page.goto(HOST + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(3000);
try {
  await page.locator('div.modal.show button', { hasText: /Nam Sài Gòn|Gò Vấp/ }).first().click({ timeout: 2500 });
  await page.waitForTimeout(500);
} catch {}

/* 先滚到中间，再点 Trang chủ，看是否滚回顶部 */
await page.evaluate(() => window.scrollTo(0, 1500));
await page.waitForTimeout(500);
const beforeScroll = await page.evaluate(() => window.scrollY);

const link = page.locator('.top-nav a[title="Trang chủ"], #navEl a[title="Trang chủ"]').first();
console.log('找到 Trang chủ 链接:', await link.count());

await link.click({ timeout: 5000 }).catch(() => {});
await page.waitForTimeout(2000);

const after = await page.evaluate(() => ({
  scrollY: window.scrollY,
  url: location.href,
  activeNav: [...document.querySelectorAll('.top-nav a, #navEl a')].filter((a) => a.closest('li')?.classList.contains('active')).map((a) => a.getAttribute('title')),
  hasCart: !!document.querySelector('.btn-cart'),
  bodyClass: document.body.className.slice(0, 60),
}));
console.log('点击前 scrollY:', beforeScroll);
console.log('点击后:', JSON.stringify(after, null, 1));
console.log(`\n判定: ${after.scrollY < beforeScroll ? '滚回顶部（锚点行为）' : after.url !== HOST + '/' ? '跳转了 ' + after.url : '完全无反应'}`);

await browser.close();
