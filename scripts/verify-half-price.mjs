/**
 * 验证 5 折改造：HTML 文本、数据层、购物车/结账链路
 *   node scripts/verify-half-price.mjs [baseUrl]
 */
import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:8787';

const results = [];
const ok = (n, p, d = '') => { results.push({ n, p }); console.log(`  ${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };

/* 数值规则自检 */
function halfPrice(o) { return Math.round(o / 2 / 100) * 100; }
const cases = [[29500, 14800], [134900, 67500], [19900, 10000], [31900, 16000], [37900, 19000], [500, 300], [100, 100]];
let ruleOk = true;
for (const [inp, want] of cases) {
  const got = halfPrice(inp);
  if (got !== want) { ruleOk = false; console.log(`    ✗ ${inp} -> ${got}, 期望 ${want}`); }
}
ok('折扣规则：÷2 后四舍五入到百位', ruleOk, cases.map(([i, w]) => `${i}→${w}`).join(' '));

/* 数据层抽查 */
const full = JSON.parse(await readFile('public/data/products-full.json', 'utf8'));
const sample = full.products.slice(0, 3).map((p) => ({ sku: p.sku, price: p.price, special: p.special_price, orig: p.price_original }));
console.log('  数据样本:', JSON.stringify(sample));
const dataOk = full.products.every((p) => !p.price || (p.special_price === halfPrice(p.price) && String(p.special_price).slice(-2) === '00'));
ok('products-full 全部按规则改造', dataOk, `${full.products.length} 条`);

const search = JSON.parse(await readFile('public/data/search-index.json', 'utf8'));
const searchOk = search.every((r) => !r[3] || String(r[3]).slice(-2) === '00');
ok('搜索索引价格也是整百', searchOk, `${search.length} 条`);

/* 浏览器：首页 / 分类 / 商品 / 购物车 / 结账 */
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
const page = await ctx.newPage();

await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(1500);
const home = await page.evaluate(() => {
  const card = [...document.querySelectorAll('.item')].find((c) => c.querySelector('.field-price'));
  const price = card?.querySelector('.field-price')?.textContent?.trim();
  const old = card?.querySelector('.field-price-old')?.textContent?.trim();
  const disc = card?.querySelector('.lbl-discount')?.textContent?.trim();
  const all = [...document.querySelectorAll('.field-price')].slice(0, 12).map((e) => e.textContent.replace(/\s+/g, ' ').trim());
  return { price, old, disc, all };
});
console.log('  首页卡:', JSON.stringify({ price: home.price, old: home.old, disc: home.disc }));
ok('首页价格形如 "xx.xxx ₫" 且整百', /00 ₫/.test(home.price || ''), home.price);
ok('首页显示 -50% 折扣标签', /-50%/.test(home.disc || ''), home.disc);
ok('首页有划线原价', !!home.old, home.old);
ok('首页所有价格都是整百', home.all.every((t) => /\d00\s?₫/.test(t.replace(/\u00a0/g, ' '))), home.all.slice(0, 4).join(' | '));

await page.goto(BASE + '/vi-nsg/product/chanh-khong-hat-500g-8935268200836-p228894', { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(1200);
const prod = await page.evaluate(() => ({
  price: document.querySelector('.product-custom .field-price')?.textContent?.replace(/\s+/g, ' ').trim(),
  old: document.querySelector('.product-custom .field-price-old')?.textContent?.trim(),
  h2: document.querySelector('.product-custom h2')?.textContent?.trim(),
}));
console.log('  商品页:', JSON.stringify(prod));
ok('商品页价格整百', /00\s?₫/.test((prod.price || '').replace(/\u00a0/g, ' ')), prod.price);

// 加购 → 购物车金额是否用折后价
await page.evaluate(() => document.querySelector('button[title="Thêm vào giỏ hàng"]')?.click());
await page.waitForTimeout(700);
const cart = await page.evaluate(() => ({
  item: window.LTM.cart()[0],
  total: window.__BP_CART__?.total,
  totalText: window.__BP_CART__?.total_amount,
}));
console.log('  购物车:', JSON.stringify({ sku: cart.item?.sku, price: cart.item?.price, total: cart.total }));
ok('加购用的是折后价', cart.item && Number(cart.item.price) % 100 === 0 && cart.item.price === cart.total, `${cart.item?.price}`);
ok('总金额整百', String(cart.total).slice(-2) === '00', String(cart.total));

// 结账页
await page.goto(BASE + '/checkout', { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(1200);
const co = await page.evaluate(() => ({
  total: document.getElementById('bp-total')?.textContent?.trim(),
  amount: document.getElementById('bp-total')?.dataset.amount,
  bpTotal: String(window.__BP_CART__?.total),
  match: document.getElementById('bp-total')?.textContent?.trim() === window.__BP_CART__?.total_amount,
}));
console.log('  结账:', JSON.stringify(co));
ok('结账金额整百且三处同源', String(co.amount).slice(-2) === '00' && co.match === true, co.total);

await browser.close();

const failed = results.filter((r) => !r.p);
console.log(`\n=== ${results.length - failed.length}/${results.length} passed ===`);
if (failed.length) process.exitCode = 1;
