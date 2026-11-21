import { chromium, devices } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:8787';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ ...devices['iPhone 12'], locale: 'vi-VN' });
const page = await ctx.newPage();

await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(2500);
await page.evaluate(() => {
  const o = document.getElementById('promo-overlay');
  if (o) o.remove();
  document.body.style.overflow = '';
});

const info = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('*').forEach((el) => {
    const cs = getComputedStyle(el);
    const over = el.scrollWidth - el.clientWidth;
    if (over > 20 && cs.display !== 'inline') {
      out.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className || '').toString().slice(0, 70),
        scrollW: el.scrollWidth,
        clientW: el.clientWidth,
        overflowX: cs.overflowX,
        flexWrap: cs.flexWrap,
        children: el.children.length,
      });
    }
  });
  return out.slice(0, 15);
});

console.log('=== 汉堡元素（scrollWidth > clientWidth）===');
info.forEach((x) => console.log(JSON.stringify(x)));

/* 商品行结构 */
const row = await page.evaluate(() => {
  const item = document.querySelector('.item:has(.field-price)');
  if (!item) return null;
  let el = item;
  const chain = [];
  for (let i = 0; i < 6 && el; i++) {
    const cs = getComputedStyle(el);
    chain.push({
      tag: el.tagName.toLowerCase(),
      cls: (el.className || '').toString().slice(0, 60),
      display: cs.display,
      flexWrap: cs.flexWrap,
      overflowX: cs.overflowX,
      scrollW: el.scrollWidth,
      clientW: el.clientWidth,
      gridCols: cs.gridTemplateColumns?.slice(0, 60),
    });
    el = el.parentElement;
  }
  return chain;
});
console.log('\n=== 商品卡向上 6 层 ===');
(row || []).forEach((x) => console.log(JSON.stringify(x)));

/* clone.css 里的移动端横滑规则 */
const css = await page.evaluate(async () => {
  const link = [...document.styleSheets].find((s) => (s.href || '').includes('clone.css'));
  if (!link) return 'no clone.css';
  try {
    return [...link.cssRules].map((r) => r.cssText).filter((t) => /overflow-x|swipe|scroll-snap/.test(t)).slice(0, 12);
  } catch { return 'cors'; }
});
console.log('\n=== clone.css 里的横滑规则 ===');
(Array.isArray(css) ? css : [css]).forEach((c) => console.log('  ' + c));

await page.screenshot({ path: 'data/raw/shots/mobile-home-detail.png', fullPage: false });
await browser.close();
