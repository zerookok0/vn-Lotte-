import { chromium, devices } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ORIGIN = 'https://www.lottemart.vn';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ ...devices['iPhone 12'], locale: 'vi-VN' });
const p = await ctx.newPage();

await p.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(3500);
try { await p.locator('div.modal.show button', { hasText: /Nam Sài Gòn|Gò Vấp/ }).first().click({ timeout: 2500 }); } catch {}
await p.evaluate(() => {
  document.querySelectorAll('.modal-backdrop').forEach((b) => b.remove());
  document.body.classList.remove('modal-open');
  document.body.style.overflow = '';
});
await p.waitForTimeout(1000);

/* 分段慢滚，给懒加载时间 */
const H = await p.evaluate(() => document.body.scrollHeight);
console.log('页面高度:', H);
for (let y = 0; y < H; y += 350) {
  await p.evaluate((yy) => window.scrollTo(0, yy), y);
  await p.waitForTimeout(230);
}
await p.waitForTimeout(2000);

/* 数商品链接 */
const stat = await p.evaluate(() => {
  const links = [...document.querySelectorAll('a[href*="/vi-nsg/product/"]')];
  const imgs = [...document.images];
  return { links: links.length, imgs: imgs.length, loadedImgs: imgs.filter((i) => i.naturalWidth > 0).length };
});
console.log('商品链接:', stat.links, '| img 标签:', stat.imgs, '| 已加载:', stat.loadedImgs);

/* 找所有「多个商品链接在同一父容器」的网格 */
const grids = await p.evaluate(() => {
  const byParent = new Map();
  document.querySelectorAll('a[href*="/vi-nsg/product/"]').forEach((a) => {
    const par = a.parentElement;
    if (!par) return;
    if (!byParent.has(par)) byParent.set(par, []);
    byParent.get(par).push(a);
  });
  const out = [];
  for (const [par, list] of byParent) {
    if (list.length < 3) continue;
    const r0 = list[0].getBoundingClientRect();
    const r1 = list[1].getBoundingClientRect();
    const cs = getComputedStyle(par);
    out.push({
      cls: par.className?.toString?.().slice(0, 56),
      display: cs.display,
      gridCols: cs.gridTemplateColumns?.slice(0, 70),
      flexWrap: cs.flexWrap,
      gap: cs.gap,
      n: list.length,
      sameRow: Math.abs(r0.y - r1.y) < 40,
      cardW: Math.round(r0.width),
      containerW: Math.round(par.getBoundingClientRect().width),
      perRow: Math.max(1, Math.round(par.getBoundingClientRect().width / Math.max(1, r0.width))),
    });
  }
  return out.sort((a, b) => b.n - a.n).slice(0, 12);
});
console.log('\n=== 商品网格容器 ===');
grids.forEach((g) => console.log('  ' + JSON.stringify(g)));

/* 截图存档 */
await p.evaluate(() => window.scrollTo(0, 0));
await p.waitForTimeout(800);
await p.screenshot({ path: 'data/raw/shots/origin-mobile-top.png', fullPage: false });

await browser.close();
