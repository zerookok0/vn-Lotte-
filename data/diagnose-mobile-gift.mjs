import { chromium, devices } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.argv[2] || 'https://vn-lotte.mating.workers.dev';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ ...devices['iPhone 12'], locale: 'vi-VN' });
const p = await ctx.newPage();

await p.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(2600);
await p.evaluate(() => {
  const o = document.getElementById('promo-overlay');
  if (o) o.remove();
  document.body.style.overflow = '';
});
await p.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 180)); }
});
await p.waitForTimeout(1500);

const info = await p.evaluate(() => {
  /* 用 tab 文字定位「MUA LÀ CÓ QUÀ」区块 */
  const btn = [...document.querySelectorAll('button[title], button')].find((b) => /Mua 1 tặng 1/i.test(b.textContent || ''));
  if (!btn) return { found: false };

  /* 找 tab 所在的 section/区块 */
  let block = btn.closest('.section') || btn.closest('section') || btn.parentElement;
  for (let i = 0; i < 6 && block && !block.querySelector('.item'); i++) block = block.parentElement;
  if (!block) return { found: false, why: 'no block with item' };

  const cards = [...block.querySelectorAll('.item')];
  const first = cards[0];
  if (!first) return { found: false, why: 'no cards' };

  /* 向上追到 swiper-wrapper 或 row */
  let el = first, chain = [];
  for (let i = 0; i < 6 && el; i++) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    chain.push({
      tag: el.tagName.toLowerCase(),
      cls: (el.className || '').toString().slice(0, 50),
      display: cs.display,
      flexBasis: cs.flexBasis,
      flexGrow: cs.flexGrow,
      flexShrink: cs.flexShrink,
      width: cs.width,
      marginRight: cs.marginRight,
      overflowX: cs.overflowX,
      rectW: Math.round(r.width),
      rectX: Math.round(r.x),
      scrollW: el.scrollWidth,
      clientW: el.clientWidth,
      kids: el.children.length,
    });
    el = el.parentElement;
  }

  const r0 = cards[0].getBoundingClientRect();
  const r1 = cards[1] ? cards[1].getBoundingClientRect() : null;

  return {
    found: true,
    blockCls: (block.className || '').toString().slice(0, 60),
    cardCount: cards.length,
    card0: { w: Math.round(r0.width), x: Math.round(r0.x), y: Math.round(r0.y) },
    card1: r1 ? { w: Math.round(r1.width), x: Math.round(r1.x), y: Math.round(r1.y) } : null,
    sameRow: r1 ? Math.abs(r0.y - r1.y) < 40 : null,
    viewport: window.innerWidth,
    chain,
  };
});

console.log(JSON.stringify(info, null, 1).slice(0, 3000));

/* 截图这个区块 */
await p.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => /Mua 1 tặng 1/i.test(b.textContent || ''));
  if (btn) {
    const y = btn.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, Math.max(0, y - 150));
  }
});
await p.waitForTimeout(800);
await p.screenshot({ path: 'data/raw/shots/mobile-giftblock-live.png' });

await browser.close();
