import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';

const sku = '8935268200836';

const cat = JSON.parse(await readFile('public/data/catalog.json', 'utf8'));
const p = cat.products.find((x) => String(x.sku) === sku);
console.log('catalog:', JSON.stringify({ price: p?.price, special: p?.special_price, orig: p?.price_original, spf: p?.special_price_formatted }));

const full = JSON.parse(await readFile('public/data/products-full.json', 'utf8'));
const fp = full.products.find((x) => String(x.sku) === sku);
console.log('products-full:', JSON.stringify({ price: fp?.price, special: fp?.special_price }));

const shard = JSON.parse(await readFile(`public/data/p/${sku.slice(0, 2)}.json`, 'utf8'));
const sp = (shard.products || []).find((x) => String(x.sku) === sku);
console.log('shard:', JSON.stringify({ price: sp?.price, special: sp?.special_price }));

const r = await fetch('http://127.0.0.1:8787/api/cart', { headers: { cookie: `ltm_cart=${sku}:1:12000; bp_oid=LTM-T` } });
console.log('api/cart:', await r.text());

const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:8787/checkout', { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(1500);

const info = await page.evaluate(() => ({
  cookie: document.cookie,
  inlineCart: window.__BP_CART__,
  totalEl: document.getElementById('bp-total')?.textContent,
  totalAmount: document.getElementById('bp-total')?.dataset.amount,
  summaryItems: [...document.querySelectorAll('.clone-summary-item')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
  connectorCart: window.BPConnector ? window.BPConnector.cart() : null,
}));
console.log('\n=== checkout page ===');
console.log(JSON.stringify(info, null, 1).slice(0, 1200));

await browser.close();
