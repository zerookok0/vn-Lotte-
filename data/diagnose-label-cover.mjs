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
  /* 找那个 Combo 5 Trái Dừa 的卡 */
  const cards = [...document.querySelectorAll('.item')];
  const card = cards.find((c) => /Combo 5 Trái Dừa/i.test(c.textContent || '')) || cards[1];
  if (!card) return { found: false };

  const imgWrap = card.querySelector('.field-img');
  const out = {
    name: (card.querySelector('.field-name')?.textContent || '').trim().slice(0, 40),
    imgWrapHtml: imgWrap ? imgWrap.outerHTML.slice(0, 1400) : null,
    images: [...card.querySelectorAll('img')].map((i) => {
      const r = i.getBoundingClientRect();
      const cs = getComputedStyle(i);
      return {
        src: (i.getAttribute('src') || '').slice(-60),
        cls: i.className?.toString?.().slice(0, 30),
        rect: { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) },
        css: { width: cs.width, height: cs.height, objectFit: cs.objectFit, position: cs.position },
      };
    }),
    spans: [...card.querySelectorAll('.field-img span')].map((s) => {
      const r = s.getBoundingClientRect();
      const cs = getComputedStyle(s);
      return { cls: s.className?.toString?.().slice(0, 30), bg: cs.backgroundImage.slice(-50), rect: { w: Math.round(r.width), h: Math.round(r.height) } };
    }),
  };
  return { found: true, ...out };
});

console.log(JSON.stringify(info, null, 1).slice(0, 2800));

await browser.close();
