import { chromium } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
const page = await ctx.newPage();

await page.goto('http://127.0.0.1:8787/checkout', { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(1500);

const info = await page.evaluate(async () => {
  const src = await (await fetch('/assets/clone.js', { cache: 'no-store' })).text();
  const scripts = [...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src'));
  return {
    scripts,
    cloneCount: scripts.filter((s) => s.includes('clone.js')).length,
    hasNewHandoff: src.includes('if (window.BPConnector) return;'),
    hasOldValidation: src.includes("if (!text('t-name'))"),
    errHTML: document.getElementById('bp-error')?.outerHTML,
    errText: document.getElementById('bp-error')?.textContent,
  };
});
console.log(JSON.stringify(info, null, 1));

// 手动触发 submit，看 error 何时出现
await page.evaluate(() => { document.getElementById('bp-error').textContent = ''; });
await page.fill('#t-name', 'Test User');
await page.fill('#t-email', 't@example.com');
await page.fill('#t-phone', '0901234567');
await page.fill('#t-addr', 'addr');
await page.fill('#bp-card-number', '4242424242424242');
await page.fill('#bp-card-expiry', '12/29');
await page.fill('#bp-card-cvc', '123');
await page.waitForTimeout(200);
await page.click('#bp-submit');
for (const t of [100, 500, 1500, 4000, 8000]) {
  await page.waitForTimeout(t);
  const s = await page.evaluate(() => ({
    err: document.getElementById('bp-error')?.textContent,
    path: location.pathname,
    busy: document.getElementById('bp-submit')?.getAttribute('aria-busy'),
  }));
  console.log(`+${t}ms`, JSON.stringify(s));
}

await browser.close();
