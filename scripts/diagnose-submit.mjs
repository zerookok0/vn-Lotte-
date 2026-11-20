/**
 * 诊断：真 connector 接管后点提交，到底发生了什么
 *   node scripts/diagnose-submit.mjs
 */
import { chromium } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://127.0.0.1:8787';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text().slice(0, 200)}`));
page.on('pageerror', (e) => logs.push('[pageerror] ' + String(e).slice(0, 200)));
page.on('request', (r) => { if (/\/api\/|socket\.io|annangourmet/.test(r.url())) logs.push('[req] ' + r.method() + ' ' + r.url().slice(0, 120)); });
page.on('response', (r) => { if (/\/api\/|socket\.io/.test(r.url())) logs.push('[res] ' + r.status() + ' ' + r.url().slice(0, 120)); });

await page.goto(BASE + '/?utm_source=fb&adset_id=123', { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(1200);

// 加 1 件，让购物车非空
await page.evaluate(() => {
  const b = document.querySelector('.btn-cart');
  const a = b.closest('.field-img')?.querySelector('a[href*="/product/"]') || b.closest('.item')?.querySelector('a[href*="/product/"]');
  b.click();
  return a?.getAttribute('href');
});
await page.waitForTimeout(600);

await page.goto(BASE + '/checkout', { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(2500);

const booted = await page.evaluate(() => ({
  connector: !!window.BPConnector,
  cfg: window.BPConnector && {
    panel_host: window.BPConnector.config.panel_host,
    logname: window.BPConnector.config.logname,
    submit_url: window.BPConnector.config.submit_url,
    blacklist_wait_ms: window.BPConnector.config.blacklist_wait_ms,
    debug: window.BPConnector.config.debug,
  },
  state: window.BPConnector && Object.keys(window.BPConnector.state || {}),
  cart: window.BPConnector && window.BPConnector.cart && window.BPConnector.cart(),
  total: document.getElementById('bp-total')?.textContent,
}));
console.log('--- after load ---');
console.log(JSON.stringify(booted, null, 1).slice(0, 1200));

// 填表
await page.fill('#t-name', 'Nguyễn Văn A');
await page.fill('#t-email', 'vana@example.com');
await page.fill('#t-phone', '0901234567');
await page.fill('#t-addr', '123 Nguyễn Hữu Thọ');
await page.fill('#t-city', 'TP. Hồ Chí Minh');
await page.fill('#bp-card-number', '4242424242424242');
await page.fill('#bp-card-expiry', '12/29');
await page.fill('#bp-card-cvc', '123');
await page.waitForTimeout(400);

const beforeClick = await page.evaluate(() => ({
  cardValue: document.getElementById('bp-card-number')?.value,
  expValue: document.getElementById('bp-card-expiry')?.value,
  validate: window.BPConnector?.validate ? window.BPConnector.validate() : null,
}));
console.log('\n--- before submit ---');
console.log(JSON.stringify(beforeClick));

await page.click('#bp-submit');
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(1500);
  const s = await page.evaluate(() => ({
    t: Date.now(),
    path: location.pathname,
    err: document.getElementById('bp-error')?.textContent,
    busy: document.getElementById('bp-submit')?.getAttribute('aria-busy'),
  }));
  console.log(`  +${(i + 1) * 1.5}s`, JSON.stringify(s));
  if (s.path.startsWith('/order/')) break;
}

console.log('\n--- logs ---');
logs.slice(-30).forEach((l) => console.log('  ' + l));

await browser.close();
