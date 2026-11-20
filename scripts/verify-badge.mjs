import { chromium, devices } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ ...devices['iPhone 12'], locale: 'vi-VN' });
const page = await ctx.newPage();

await page.goto('http://127.0.0.1:8787/vi-nsg/product/nam-mo-trang-uc-200g-9337441000025-9337441000025-p71479', { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(1800);

await page.evaluate(() => document.querySelector('button[title="Thêm vào giỏ hàng"]').click());
await page.waitForTimeout(800);

const r = await page.evaluate(() => ({
  toast: document.getElementById('clone-toast')?.textContent,
  itemName: window.LTM.cart()[0]?.name,
  itemPrice: window.LTM.cart()[0]?.price,
  badge: document.querySelector('.clone-badge')?.textContent,
  badgeVisible: document.querySelector('.clone-badge') && getComputedStyle(document.querySelector('.clone-badge')).display,
  galleryImgs: document.querySelectorAll('.swiper-gallery img').length,
  visibleSlides: [...document.querySelectorAll('.swiper-gallery .swiper-slide')].filter((s) => getComputedStyle(s).display !== 'none').length,
}));
console.log(JSON.stringify(r, null, 1));

await page.screenshot({ path: 'data/raw/shots/mobile-product-after-add.png', fullPage: false });
await browser.close();
