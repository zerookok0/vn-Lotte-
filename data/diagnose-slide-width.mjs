import { chromium, devices } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.argv[2] || 'https://vn-lotte.mating.workers.dev';
const PAGE = '/vi-nsg/tp5/sinh-nhat-lotte';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ ...devices['iPhone 12'], locale: 'vi-VN' });
const p = await ctx.newPage();

await p.goto(BASE + PAGE, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(2600);
await p.evaluate(() => {
  const o = document.getElementById('promo-overlay');
  if (o) o.remove();
  document.body.style.overflow = '';
});
await p.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 170)); }
});
await p.waitForTimeout(1500);

const info = await p.evaluate(() => {
  /* 找含 field-more（Mua 1 tặng 1 标签）的卡 */
  const cards = [...document.querySelectorAll('.item')].filter((el) => el.querySelector('.field-more'));
  if (!cards.length) return { found: false };

  const first = cards[0];
  const slide = first.closest('.swiper-slide');
  const wrap = first.closest('.swiper-wrapper');
  const swiper = first.closest('.swiper');

  const rect = (el) => el ? { w: Math.round(el.getBoundingClientRect().width), x: Math.round(el.getBoundingClientRect().x), h: Math.round(el.getBoundingClientRect().height) } : null;
  const css = (el, props) => el ? Object.fromEntries(props.map((k) => [k, getComputedStyle(el)[k]])) : null;

  const r0 = rect(first);
  const r1 = cards[1] ? rect(cards[1]) : null;

  return {
    found: true,
    cardCount: cards.length,
    card0: r0,
    card1: r1,
    cardSameRow: r1 ? Math.abs(first.getBoundingClientRect().y - cards[1].getBoundingClientRect().y) < 40 : null,
    slide: rect(slide),
    slideCss: css(slide, ['width', 'flexBasis', 'flexGrow', 'flexShrink', 'marginRight', 'boxSizing']),
    slideInline: slide?.getAttribute('style') || '',
    wrap: rect(wrap),
    wrapCss: css(wrap, ['display', 'overflowX', 'flexWrap']),
    swiper: rect(swiper),
    viewport: window.innerWidth,
    itemCss: css(first, ['width', 'minWidth', 'maxWidth']),
    /* 卡片内的 .img 容器 */
    imgWrap: rect(first.querySelector('.field-img')),
  };
});

console.log(JSON.stringify(info, null, 1).slice(0, 2600));

await p.evaluate(() => {
  const card = [...document.querySelectorAll('.item')].find((el) => el.querySelector('.field-more'));
  if (card) {
    const y = card.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, Math.max(0, y - 200));
  }
});
await p.waitForTimeout(700);
await p.screenshot({ path: 'data/raw/shots/sinhnhat-mobile.png' });

await browser.close();
