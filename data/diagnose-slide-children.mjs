import { chromium, devices } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.argv[2] || 'https://vn-lotte.mating.workers.dev';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ ...devices['iPhone 12'], locale: 'vi-VN' });
const p = await ctx.newPage();

await p.goto(BASE + '/vi-nsg/tp5/sinh-nhat-lotte', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(2600);
await p.evaluate(() => {
  const o = document.getElementById('promo-overlay');
  if (o) o.remove();
  document.body.style.overflow = '';
});
await p.evaluate(async () => {
  for (let y = 0; y < 5000; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 140)); }
});
await p.waitForTimeout(1400);

const info = await p.evaluate(() => {
  const w = [...document.querySelectorAll('.swiper-wrapper')].find((x) => x.querySelector('.field-more'));
  if (!w) return { found: false };

  const cs = getComputedStyle(w);
  const kids = [...w.children].slice(0, 4).map((k) => {
    const kcs = getComputedStyle(k);
    const r = k.getBoundingClientRect();
    return {
      tag: k.tagName.toLowerCase(),
      cls: (k.className || '').toString().slice(0, 50),
      display: kcs.display,
      width: kcs.width,
      flex: kcs.flex,
      inlineStyle: (k.getAttribute('style') || '').slice(0, 90),
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    };
  });

  const wr = w.getBoundingClientRect();
  return {
    found: true,
    wrap: {
      cls: (w.className || '').toString().slice(0, 60),
      display: cs.display,
      flexWrap: cs.flexWrap,
      flexDirection: cs.flexDirection,
      rect: { w: Math.round(wr.width), h: Math.round(wr.height) },
      inlineStyle: (w.getAttribute('style') || '').slice(0, 200),
      childCount: w.children.length,
    },
    kids,
  };
});

console.log(JSON.stringify(info, null, 1).slice(0, 2400));

/* 截图 */
await p.evaluate(() => {
  const c = [...document.querySelectorAll('.item')].find((e) => e.querySelector('.field-more'));
  if (c) window.scrollTo(0, Math.max(0, c.getBoundingClientRect().top + window.scrollY - 200));
});
await p.waitForTimeout(800);
await p.screenshot({ path: 'data/raw/shots/sinhnhat-check.png' });
console.log('screenshot saved');

await browser.close();
