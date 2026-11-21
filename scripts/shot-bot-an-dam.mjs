import { chromium } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
const page = await ctx.newPage();

await page.goto('http://127.0.0.1:8787/vi-nsg/category/bot-an-dam-c731', { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const o = document.getElementById('promo-overlay');
  if (o) o.remove();
  document.body.style.overflow = '';
});

// 滚到「Góc ăn dặm cho bé」那一块
const found = await page.evaluate(() => {
  const el = [...document.querySelectorAll('h2,h3,div,span')].find((e) => /Góc ăn dặm/.test(e.textContent || '') && e.children.length < 6);
  if (!el) return null;
  const y = el.getBoundingClientRect().top + window.scrollY;
  window.scrollTo(0, Math.max(0, y - 120));
  return { y: Math.round(y), text: (el.textContent || '').trim().slice(0, 40) };
});
console.log('found section:', JSON.stringify(found));

await page.waitForTimeout(1500);

const info = await page.evaluate(() => {
  const section = [...document.querySelectorAll('section,div')].find((e) => /Góc ăn dặm/.test(e.textContent || '') && e.querySelectorAll('a[href*="/vi-nsg/product/"]').length > 3);
  if (!section) return { found: false };
  const cards = [...section.querySelectorAll('a[href*="/vi-nsg/product/"]')];
  const withBg = cards.filter((a) => {
    const sp = a.querySelector('span');
    const img = a.querySelector('img');
    return (img && img.getAttribute('src')) || (sp && String(getComputedStyle(sp).backgroundImage || '').includes('url('));
  });
  return { found: true, cards: cards.length, withImage: withBg.length };
});
console.log('section cards:', JSON.stringify(info));

await page.screenshot({ path: 'data/raw/shots/bot-an-dam-section.png', fullPage: false });
await browser.close();
