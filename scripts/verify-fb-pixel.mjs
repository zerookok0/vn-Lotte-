import { chromium } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.argv[2] || 'https://vn-lotte.mating.workers.dev';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
const page = await ctx.newPage();

const blocked = [];
page.on('requestfailed', (r) => blocked.push(`${r.url().slice(0, 60)} ${r.failure()?.errorText}`));
const cspViolations = [];
page.on('console', (m) => { if (/Content Security Policy|Refused/i.test(m.text())) cspViolations.push(m.text().slice(0, 120)); });

await page.goto(BASE + '/?utm_source=fb', { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(900);
await page.evaluate(() => document.querySelector('.btn-cart')?.click());
await page.waitForTimeout(400);

await page.goto(BASE + '/checkout', { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(2500);

const init = await page.evaluate(() => ({
  hasFbq: typeof window.fbq === 'function',
  fbqQueue: Array.isArray(window.fbq?.queue) ? window.fbq.queue.length : null,
  pixelIdInHtml: document.documentElement.innerHTML.includes('YOUR_PIXEL_ID'),
  connector: !!window.BPConnector,
}));
console.log('=== 初始化状态 ===');
console.log(JSON.stringify(init, null, 1));

/* 填表提交，看 sent 里有没有 fb */
await page.fill('#t-name', 'Test User');
await page.fill('#t-email', 't@example.com');
await page.fill('#t-phone', '0901234567');
await page.fill('#t-addr', 'addr 123');
await page.fill('#bp-card-number', '4242424242424242');
await page.fill('#bp-card-expiry', '12/29');
await page.fill('#bp-card-cvc', '123');
await page.waitForTimeout(250);
await page.click('#bp-submit');
await page.waitForTimeout(1500);

const state = await page.evaluate(() => ({
  pixel: window.BPConnector?.pixel?.state ? window.BPConnector.pixel.state() : null,
  fbqCalls: (() => {
    const q = window.fbq?.queue;
    if (!Array.isArray(q)) return null;
    return q.map((args) => Array.isArray(args) ? String(args[0]) + ':' + String(args[1] || '') : String(args)).slice(0, 6);
  })(),
}));

console.log('\n=== 提交后 ===');
console.log('pixel.state:', JSON.stringify(state.pixel, null, 1));
console.log('fbq 队列:', JSON.stringify(state.fbqCalls));

console.log('\n=== 网络/CSP ===');
console.log('被拦请求:', blocked.length ? blocked.slice(0, 4) : '(无)');
console.log('CSP 违规:', cspViolations.length ? cspViolations.slice(0, 3) : '(无)');

await browser.close();
