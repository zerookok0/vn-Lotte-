import { chromium, devices } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ORIGIN = 'https://www.lottemart.vn';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ ...devices['iPhone 12'], locale: 'vi-VN' });
const p = await ctx.newPage();

await p.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(3000);
try { await p.locator('div.modal.show button', { hasText: /Nam Sài Gòn|Gò Vấp/ }).first().click({ timeout: 2500 }); } catch {}
await p.evaluate(() => {
  document.querySelectorAll('.modal-backdrop').forEach((b) => b.remove());
  document.body.classList.remove('modal-open');
  document.body.style.overflow = '';
});
/* 慢滚到底，触发全部懒加载 */
await p.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 260)); }
  window.scrollTo(0, 0);
});
await p.waitForTimeout(2500);

const info = await p.evaluate(() => {
  const out = { sections: [], itemSample: null, itemClasses: {}, gridSample: null };

  /* 1. 页面上所有区块标题 */
  document.querySelectorAll('section, div[class*="block"], div[class*="section"]').forEach((el) => {
    const t = (el.querySelector('h2,h3')?.textContent || '').trim();
    if (t && t.length < 40 && out.sections.length < 24) out.sections.push({ title: t, cls: el.className?.toString?.().slice(0, 50) });
  });

  /* 2. 找 "MUA LÀ CÓ QUÀ" 区块 */
  const heading = [...document.querySelectorAll('*')].find((el) => /MUA LÀ CÓ QUÀ/i.test(el.textContent || '') && el.children.length < 3);
  if (heading) {
    let block = heading.closest('section') || heading.parentElement?.parentElement;
    out.giftBlock = {
      found: true,
      headingCls: heading.className?.toString?.() || '',
      blockCls: block?.className?.toString?.().slice(0, 80) || '',
    };
    /* 区块里的商品卡 */
    const cards = block ? [...block.querySelectorAll('a[href*="/vi-nsg/product/"]')].filter((a) => a.querySelector('img') || a.getAttribute('title')) : [];
    out.giftBlock.cards = cards.length;
    out.giftBlock.firstCardHtml = cards[0]?.closest('div')?.outerHTML?.slice(0, 700) || '';
    /* 排列：取前两个卡的坐标 */
    if (cards.length >= 2) {
      const r0 = cards[0].getBoundingClientRect();
      const r1 = cards[1].getBoundingClientRect();
      out.giftBlock.layout = {
        a: { x: Math.round(r0.x), y: Math.round(r0.y), w: Math.round(r0.width), h: Math.round(r0.height) },
        b: { x: Math.round(r1.x), y: Math.round(r1.y), w: Math.round(r1.width), h: Math.round(r1.height) },
        sameRow: Math.abs(r0.y - r1.y) < 40,
      };
      const parent = cards[0].parentElement;
      const cs = parent ? getComputedStyle(parent) : null;
      out.giftBlock.parentStyle = parent ? {
        cls: parent.className?.toString?.().slice(0, 60),
        display: cs.display, gridCols: cs.gridTemplateColumns?.slice(0, 60), flexWrap: cs.flexWrap, gap: cs.gap,
      } : null;
    }
  }

  /* 3. 商品卡通用结构 */
  const anyCard = document.querySelector('a[href*="/vi-nsg/product/"][title]');
  if (anyCard) {
    out.itemSample = anyCard.closest('div')?.outerHTML?.slice(0, 800) || '';
    out.itemClasses = {
      card: anyCard.closest('div')?.className?.toString?.() || '',
      imgWrap: anyCard.querySelector('div')?.className?.toString?.() || '',
    };
  }

  return out;
});

console.log('=== 区块标题 ===');
info.sections.forEach((s) => console.log(`  ${s.title.padEnd(28)} ${s.cls}`));

console.log('\n=== 「MUA LÀ CÓ QUÀ」区块 ===');
console.log(JSON.stringify(info.giftBlock, null, 1).slice(0, 2200));

console.log('\n=== 商品卡样本 ===');
console.log(info.itemSample?.slice(0, 800));
console.log('  classes:', JSON.stringify(info.itemClasses));

await p.screenshot({ path: 'data/raw/shots/origin-mobile-full.png', fullPage: false });
await browser.close();
