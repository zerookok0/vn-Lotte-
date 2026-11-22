import { chromium, devices } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.argv[2] || 'https://vn-lotte.mating.workers.dev';
const PAGE = '/vi-nsg/category/rau-cu-c3';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ ...devices['iPhone 12'], locale: 'vi-VN' });
const p = await ctx.newPage();

await p.goto(BASE + PAGE, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(2600);
await p.evaluate(() => {
  const o = document.getElementById('promo-overlay');
  if (o) o.remove();
  document.body.style.overflow = '';
  document.querySelectorAll('.search-block, .search-dropdown, .offcanvas').forEach((e) => { e.style.display = 'none'; });
});
await p.waitForTimeout(500);

const info = await p.evaluate(() => {
  /* 只认真正的商品卡：含 .field-price 的 .item */
  const cards = [...document.querySelectorAll('.item')].filter((c) => c.querySelector('.field-price') && c.querySelector('.field-img'));
  const out = { cardCount: cards.length, samples: [] };

  for (const card of cards.slice(0, 3)) {
    const imgWrap = card.querySelector('.field-img');
    const imgLink = card.querySelector('.field-img a');
    const nameLink = card.querySelector('.field-name a');

    const rectOf = (el) => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) }; };

    /* 图片中心点上是谁 */
    let atCenter = null;
    let atCenterTop5 = [];
    if (imgWrap) {
      const r = imgWrap.getBoundingClientRect();
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      const stack = document.elementsFromPoint(cx, cy).slice(0, 5).map((el) => ({
        tag: el.tagName.toLowerCase(),
        cls: (el.className || '').toString().slice(0, 40),
        isLink: !!el.closest('a'),
        href: el.closest('a')?.getAttribute('href') || null,
        pe: getComputedStyle(el).pointerEvents,
      }));
      atCenterTop5 = stack;
      atCenter = stack[0] || null;
    }

    out.samples.push({
      name: (card.querySelector('.field-name')?.textContent || '').trim().slice(0, 26),
      imgLink: imgLink ? { href: imgLink.getAttribute('href'), rect: rectOf(imgLink), pe: getComputedStyle(imgLink).pointerEvents } : null,
      nameLink: nameLink ? { href: nameLink.getAttribute('href'), rect: rectOf(nameLink), pe: getComputedStyle(nameLink).pointerEvents } : null,
      imgWrap: imgWrap ? rectOf(imgWrap) : null,
      elementsAtImageCenter: atCenterTop5,
    });
  }
  return out;
});

console.log(JSON.stringify(info, null, 1).slice(0, 4000));

/* 真点一次 */
const box = await p.evaluate(() => {
  const card = [...document.querySelectorAll('.item')].find((c) => c.querySelector('.field-price') && c.querySelector('.field-img'));
  if (!card) return null;
  const img = card.querySelector('.field-img');
  window.scrollTo(0, img.getBoundingClientRect().top + window.scrollY - 220);
  return null;
});
await p.waitForTimeout(700);
const pos = await p.evaluate(() => {
  const card = [...document.querySelectorAll('.item')].find((c) => c.querySelector('.field-price') && c.querySelector('.field-img'));
  const r = card.querySelector('.field-img').getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
});
const before = p.url();
await Promise.all([
  p.waitForNavigation({ timeout: 6000 }).catch(() => null),
  p.mouse.click(pos.x, pos.y),
]);
await p.waitForTimeout(1500);
console.log(`\n点图片中心 (${pos.x},${pos.y}): ${before === p.url() ? '❌ 没跳转' : '✅ → ' + p.url()}`);

await browser.close();
