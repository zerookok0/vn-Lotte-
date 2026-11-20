/**
 * 移动端适配回归：首图 banner、商品行横滑、商品页下单按钮
 *   node scripts/verify-mobile.mjs
 */
import { chromium, devices } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:8787';

const results = [];
const ok = (n, p, d = '') => { results.push({ n, p }); console.log(`  ${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

/* ---- 首页（iPhone 12 尺寸） ---- */
const ctx = await browser.newContext({ ...devices['iPhone 12'], locale: 'vi-VN' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));

await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(1800);

const home = await page.evaluate(() => {
  const banner = document.querySelector('.main-slide img');
  const wrap = document.querySelector('.main-slide .swiper-wrapper');
  const row = [...document.querySelectorAll('.swiper-wrapper')].find((w) => !w.closest('.main-slide') && w.children.length > 2);
  return {
    viewport: window.innerWidth,
    bannerSrc: banner ? banner.getAttribute('src') : null,
    bannerIsMobile: banner ? /\/750_/.test(banner.getAttribute('src') || '') : false,
    bannerW: banner ? Math.round(banner.getBoundingClientRect().width) : 0,
    mainWrapOverflow: wrap ? getComputedStyle(wrap).overflowX : null,
    rowOverflow: row ? getComputedStyle(row).overflowX : null,
    rowScrollable: row ? row.scrollWidth > row.clientWidth + 4 : false,
    rowScrollWidth: row ? row.scrollWidth : 0,
    rowClientWidth: row ? row.clientWidth : 0,
    userCards: document.querySelectorAll('.btn-cart').length,
    docOverflow: document.documentElement.scrollWidth > window.innerWidth,
    modal: !!document.querySelector('.modal-welcome'),
  };
});
console.log('  首页:', JSON.stringify(home));

ok('首图换成移动版 banner (750_)', home.bannerIsMobile, home.bannerSrc?.slice(-46));
ok('首图铺满屏宽', home.bannerW >= home.viewport - 20, `${home.bannerW}px / ${home.viewport}px`);
ok('商品行可横向滚动', home.rowScrollable, `scrollWidth=${home.rowScrollWidth} clientWidth=${home.rowClientWidth}`);
ok('商品行 overflow-x 为 auto', home.rowOverflow === 'auto', String(home.rowOverflow));
ok('无页面级横向溢出', home.docOverflow === false);
ok('首页无残留弹窗', home.modal === false);

// 真实滑动一次
const scrolled = await page.evaluate(async () => {
  const row = [...document.querySelectorAll('.swiper-wrapper')].find((w) => !w.closest('.main-slide') && w.children.length > 2);
  if (!row) return null;
  const before = row.scrollLeft;
  row.scrollLeft = 240;
  await new Promise((r) => setTimeout(r, 250));
  return { before, after: row.scrollLeft };
});
ok('横向滑动实际生效', !!scrolled && scrolled.after > scrolled.before, JSON.stringify(scrolled));

await page.screenshot({ path: 'data/raw/shots/mobile-home.png', fullPage: false });
await ctx.close();

/* ---- 商品详情页（移动端加购） ---- */
const ctx2 = await browser.newContext({ ...devices['iPhone 12'], locale: 'vi-VN' });
const p2 = await ctx2.newPage();
await p2.goto(BASE + '/vi-nsg/product/chanh-khong-hat-500g-8935268200836-p228894', { waitUntil: 'networkidle', timeout: 45000 });
await p2.waitForTimeout(1500);

const prod = await p2.evaluate(() => ({
  title: document.title,
  h1: (document.querySelector('h1') || {}).textContent?.trim().slice(0, 60),
  addBtn: !!document.querySelector('button[title="Thêm vào giỏ hàng"]'),
  priceText: (document.querySelector('.field-price, [class*="field-price"]') || {}).textContent?.trim(),
}));
console.log('  商品页:', JSON.stringify(prod));
ok('商品页标题是该商品', /Chanh Không Hạt/i.test(prod.title), prod.title.slice(0, 50));
ok('存在加购按钮', prod.addBtn === true);

const cartBefore = await p2.evaluate(() => (window.LTM ? window.LTM.cart().length : -1));
await p2.click('button[title="Thêm vào giỏ hàng"]');
await p2.waitForTimeout(600);
const cartAfter = await p2.evaluate(() => ({
  n: window.LTM ? window.LTM.cart().length : -1,
  badge: (document.querySelector('.clone-badge') || {}).textContent,
  total: (window.__BP_CART__ || {}).total_amount,
  item: window.LTM ? window.LTM.cart()[0] : null,
}));
ok('点加购真的进购物车', cartAfter.n === cartBefore + 1, `${cartBefore} → ${cartAfter.n}`);
ok('购物车金额同步到 __BP_CART__', !!cartAfter.total && cartAfter.total !== '0 ₫', cartAfter.total);
console.log('  购物车项:', JSON.stringify(cartAfter.item));

await p2.screenshot({ path: 'data/raw/shots/mobile-product.png', fullPage: false });

/* ---- 两个不同商品应该是两个不同页面 ---- */
const other = await ctx2.newPage();
await other.goto(BASE + '/vi-nsg/product/phile-ga-niwatori-500g-8936147110284-p231033', { waitUntil: 'networkidle', timeout: 45000 });
await other.waitForTimeout(900);
const otherTitle = await other.title();
ok('不同商品是不同页面', otherTitle !== prod.title, `${prod.title.slice(0, 30)} vs ${otherTitle.slice(0, 30)}`);
await other.close();
await ctx2.close();

ok('无 JS 异常', errs.length === 0, errs[0] || '');

await browser.close();
const failed = results.filter((r) => !r.p);
console.log(`\n=== ${results.length - failed.length}/${results.length} passed ===`);
if (failed.length) process.exitCode = 1;
