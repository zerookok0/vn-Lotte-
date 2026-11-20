import { chromium, devices } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ ...devices['iPhone 12'], locale: 'vi-VN' });
const page = await ctx.newPage();

await page.goto('http://127.0.0.1:8787/vi-nsg/product/nam-mo-trang-uc-200g-9337441000025-9337441000025-p71479', { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(1500);

const info = await page.evaluate(() => {
  const cartLinks = [...document.querySelectorAll('a[href="/cart"], a[href="/cart/"], a[href*="/cart"]')];
  const headerIcons = [...document.querySelectorAll('.header-app .h-right a, .header-app .h-right button, .header-app [class*="icon-cart"]')];
  return {
    cartLinks: cartLinks.map((e) => ({ tag: e.tagName, href: e.getAttribute('href'), cls: e.className.slice(0, 40), rect: e.getBoundingClientRect().width })),
    icons: headerIcons.map((e) => ({ tag: e.tagName, cls: String(e.className).slice(0, 50), href: e.getAttribute('href') })),
    badgeExists: !!document.querySelector('.clone-badge'),
    headerHTML: (document.querySelector('.header-app .h-right') || {}).outerHTML?.slice(0, 900) || (document.querySelector('.header-app') || {}).outerHTML?.slice(0, 600),
  };
});
console.log(JSON.stringify(info, null, 1).slice(0, 2500));

// 加购后看角标
await page.evaluate(() => {
  const b = document.querySelector('button[title="Thêm vào giỏ hàng"]');
  if (b) b.click();
});
await page.waitForTimeout(800);

const after = await page.evaluate(() => {
  const badge = document.querySelector('.clone-badge');
  return {
    badge: badge ? { text: badge.textContent, display: getComputedStyle(badge).display, parent: badge.parentElement?.tagName + '.' + String(badge.parentElement?.className).slice(0, 30) } : null,
    cartLen: window.LTM ? window.LTM.cart().length : -1,
    total: window.__BP_CART__?.total_amount,
  };
});
console.log('after add:', JSON.stringify(after, null, 1));

await page.screenshot({ path: 'data/raw/shots/mobile-product-after-add.png', fullPage: false });
await browser.close();
