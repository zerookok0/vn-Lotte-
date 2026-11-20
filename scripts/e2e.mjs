/* [ltm-clone] LOTTE Mart Vietnam — storefront clone (sandbox fixture)
 * visual reference: https://www.lottemart.vn/ (snapshot 2026-11-20)
 * for internal testing / demo use only — not affiliated with LOTTE Mart
 */
/**
 * 端到端流程测试：首页 → 加购 → 购物车 → 结账 → 成功页
 *   node scripts/e2e.mjs
 */
import { chromium } from 'playwright-core';
import path from 'node:path';

const ROOT = path.resolve('.');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:8787';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
const page = await ctx.newPage();

const log = (...a) => console.log(...a);
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + String(e).slice(0, 200)));
page.on('requestfailed', (r) => errors.push('REQFAIL ' + r.url().slice(0, 140)));
page.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url().slice(0, 140)}`); });

/* 1. 首页 */
await page.goto(BASE + '/?utm_source=fb&adset_id=123', { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(1200);
const home = await page.evaluate(() => ({
  title: document.title,
  cartSkeleton: !!window.__BP_CART__,
  utm: window.__BP_UTM__,
  addBtns: document.querySelectorAll('.btn-cart').length,
  productLinks: document.querySelectorAll('a[href*="/vi-nsg/product/"]').length,
}));
log('1) 首页:', JSON.stringify(home));

/* 2. 加购 3 次（不同商品） */
const clicked = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.btn-cart')].slice(0, 3);
  const out = [];
  for (const b of btns) {
    const a = b.closest('.field-img')?.querySelector('a[href*="/product/"]')
      || b.closest('.item')?.querySelector('a[href*="/product/"]');
    if (!a) continue;
    b.click();
    out.push(a.getAttribute('href'));
  }
  return out;
});
await page.waitForTimeout(600);
const afterAdd = await page.evaluate(() => ({
  cart: window.LTM ? window.LTM.cart() : null,
  badge: document.querySelector('.clone-badge')?.textContent,
  bpCart: window.__BP_CART__,
}));
log('2) 加购后:', JSON.stringify(afterAdd).slice(0, 600));

/* 3. 购物车页 */
await page.goto(BASE + '/cart', { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(800);
const cartPage = await page.evaluate(() => ({
  rows: document.querySelectorAll('.clone-cart-row').length,
  total: document.getElementById('bp-total')?.textContent,
  totalAmount: document.getElementById('bp-total')?.dataset.amount,
  bpTotal: window.__BP_CART__?.total,
  match: document.getElementById('bp-total')?.textContent === window.__BP_CART__?.total_amount,
}));
log('3) 购物车页:', JSON.stringify(cartPage));
await page.screenshot({ path: path.join(ROOT, 'data/raw/shots/local-cart.png'), fullPage: true });

/* 3b. 数量 +1 */
await page.click('.clone-qty button[data-qty="1"]');
await page.waitForTimeout(400);
const afterQty = await page.evaluate(() => ({
  rows: document.querySelectorAll('.clone-cart-row').length,
  qty: document.querySelector('.clone-qty span')?.textContent,
  total: document.getElementById('bp-total')?.textContent,
}));
log('3b) 数量+1:', JSON.stringify(afterQty));

/* 4. 结账页 */
await page.goto(BASE + '/checkout', { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(900);
const co = await page.evaluate(() => ({
  hasForm: !!document.getElementById('bp-form'),
  cardFields: document.querySelectorAll('#bp-card-number,#bp-card-expiry,#bp-card-cvc').length,
  total: document.getElementById('bp-total')?.textContent,
  items: document.querySelectorAll('.clone-summary-item').length,
  errorDisplay: getComputedStyle(document.getElementById('bp-error')).display,
  submitDisabled: document.getElementById('bp-submit')?.disabled,
}));
log('4) 结账页:', JSON.stringify(co));
await page.screenshot({ path: path.join(ROOT, 'data/raw/shots/local-checkout.png'), fullPage: true });

/* 5. 填表 + 提交 */
await page.fill('#t-name', 'Nguyễn Văn A');
await page.fill('#t-email', 'vana@example.com');
await page.fill('#t-phone', '0901234567');
await page.fill('#t-addr', '123 Nguyễn Hữu Thọ, Quận 7');
await page.fill('#t-city', 'TP. Hồ Chí Minh');
await page.fill('#t-district', 'Quận 7');
await page.fill('#bp-card-number', '4242 4242 4242 4242');
await page.fill('#bp-card-expiry', '12/29');
await page.fill('#bp-card-cvc', '123');
await page.waitForTimeout(300);

const beforeSubmit = await page.evaluate(() => window.__BP_CART__);
await Promise.all([
  page.waitForURL(/\/order\//, { timeout: 20000 }).catch(() => null),
  page.click('#bp-submit'),
]);
await page.waitForTimeout(1200);

const final = await page.evaluate(() => ({
  path: location.pathname,
  search: location.search,
  orderOnPage: document.getElementById('clone-order-number')?.textContent,
  total: document.getElementById('bp-total')?.textContent,
  heading: document.querySelector('.clone-h1')?.textContent,
}));
log('5) 提交后:', JSON.stringify(final));
log('   提交前 __BP_CART__.order_number:', beforeSubmit?.order_number, '| total:', beforeSubmit?.total);
await page.screenshot({ path: path.join(ROOT, 'data/raw/shots/local-order.png'), fullPage: true });

log('\nconsole errors:', errors.length);
errors.slice(0, 8).forEach((e) => log('  ! ' + e));

await browser.close();
