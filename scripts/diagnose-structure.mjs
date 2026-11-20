/* [ltm-clone] LOTTE Mart Vietnam — storefront clone (sandbox fixture)
 * visual reference: https://www.lottemart.vn/ (snapshot 2026-11-20)
 * for internal testing / demo use only — not affiliated with LOTTE Mart
 */
import { chromium } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:8787/vi-nsg/category/rau-cu-c3', { waitUntil: 'networkidle', timeout: 45000 });
await page.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 800) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 50)); }
  window.scrollTo(0, 0);
});
await page.waitForTimeout(1200);

const report = await page.evaluate(() => {
  const a = document.querySelector('a[href*="/vi-nsg/product/"]');
  const holder = a ? a.firstElementChild : null;
  return {
    anchorHTML: a ? a.outerHTML.slice(0, 500) : null,
    holderTag: holder ? holder.tagName : null,
    holderHTML: holder ? holder.outerHTML.slice(0, 400) : null,
    totalAnchors: document.querySelectorAll('a[href*="/vi-nsg/product/"]').length,
    imgCount: document.querySelectorAll('a[href*="/vi-nsg/product/"] img').length,
    spanCount: document.querySelectorAll('a[href*="/vi-nsg/product/"] span').length,
  };
});
console.log(JSON.stringify(report, null, 2));

// 商品页结构
await page.goto('http://127.0.0.1:8787/vi-nsg/product/bo-lat-anchor-mieng-200g-9415007055648-p69485', { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(1500);
const prod = await page.evaluate(() => {
  const gallery = document.querySelector('[class*="gallery"], [class*="slide"], .swiper');
  const main = document.querySelector('[class*="product-detail"], [class*="product-info"], [class*="detail"]');
  const imgs = [...document.querySelectorAll('img')].slice(0, 10).map((i) => ({ src: i.getAttribute('src')?.slice(0, 80), cls: i.className, w: i.width, h: i.height }));
  return {
    galleryHTML: gallery ? gallery.outerHTML.slice(0, 800) : null,
    mainHTML: main ? main.outerHTML.slice(0, 800) : null,
    imgs,
  };
});
console.log('\n=== product page ===');
console.log(JSON.stringify(prod, null, 2).slice(0, 2500));

await browser.close();
