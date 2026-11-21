import { chromium } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
const page = await ctx.newPage();

const bad = [];
page.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url().slice(-50)}`); });

await page.goto('http://127.0.0.1:8787/vi-nsg/tp5/me-va-be', { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const o = document.getElementById('promo-overlay');
  if (o) o.remove();
  document.body.style.overflow = '';
});
await page.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 35)); }
});
await page.waitForTimeout(1200);

const r = await page.evaluate(() => {
  const spans = [...document.querySelectorAll('a[href*="/vi-nsg/product/"] span')];
  const noBg = spans.filter((s) => !String(getComputedStyle(s).backgroundImage || '').includes('url(')).length;
  const imgs = [...document.querySelectorAll('img')];
  return {
    spans: spans.length,
    noBg,
    imgs: imgs.length,
    broken: imgs.filter((i) => i.complete && i.naturalWidth === 0 && i.getAttribute('src')).length,
  };
});
console.log('me-va-be:', JSON.stringify(r), '| 404:', bad.length);
bad.slice(0, 5).forEach((b) => console.log('   ' + b));

// 滚到「Váng sữa」那一块
await page.evaluate(() => {
  const el = [...document.querySelectorAll('*')].find((e) => /Váng sữa/.test(e.textContent || '') && e.children.length < 8);
  if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 200);
});
await page.waitForTimeout(1200);
await page.screenshot({ path: 'data/raw/shots/me-va-be.png', fullPage: false });

await browser.close();
