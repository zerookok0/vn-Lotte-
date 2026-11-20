import { chromium } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:8787/?utm_source=fb', { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(600);
await page.evaluate(() => document.querySelector('.btn-cart').click());
await page.waitForTimeout(400);
await page.goto('http://127.0.0.1:8787/checkout', { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(2000);

const forms = await page.evaluate(() => [...document.querySelectorAll('form')].map((f, i) => ({
  i, id: f.id, cls: f.className, action: f.getAttribute('action'),
  inputs: f.querySelectorAll('input,select').length,
  hasSubmit: !!f.querySelector('#bp-submit'),
  hasName: !!f.querySelector('#t-name'),
  parentCls: f.parentElement?.className,
})));

console.log('forms:', JSON.stringify(forms, null, 1));

// 填值后点击，逐步观察
await page.fill('#t-name', 'Nguyễn Văn A');
await page.fill('#t-email', 'vana@example.com');
await page.fill('#t-phone', '0901234567');
await page.fill('#t-addr', '123 ABC');
await page.fill('#bp-card-number', '4242424242424242');
await page.fill('#bp-card-expiry', '12/29');
await page.fill('#bp-card-cvc', '123');
await page.waitForTimeout(300);

const pre = await page.evaluate(() => ({
  name: document.getElementById('t-name')?.value,
  email: document.getElementById('t-email')?.value,
  formOfName: document.getElementById('t-name')?.form?.id,
  submitForm: document.getElementById('bp-submit')?.form?.id,
}));
console.log('pre-click:', JSON.stringify(pre));

// 捕获 submit 事件
await page.evaluate(() => {
  window.__submits = [];
  document.addEventListener('submit', (e) => {
    window.__submits.push({
      formId: e.target.id,
      defaultPrevented: e.defaultPrevented,
      tName: document.getElementById('t-name')?.value,
      at: Date.now(),
    });
  }, true);
});

await page.click('#bp-submit');
await page.waitForTimeout(120);
const post = await page.evaluate(() => ({
  submits: window.__submits,
  name: document.getElementById('t-name')?.value,
  email: document.getElementById('t-email')?.value,
  err: document.getElementById('bp-error')?.textContent,
  path: location.pathname,
}));
console.log('post-click(120ms):', JSON.stringify(post, null, 1));

await page.waitForTimeout(3000);
const later = await page.evaluate(() => ({
  name: document.getElementById('t-name')?.value,
  err: document.getElementById('bp-error')?.textContent,
  path: location.pathname,
}));
console.log('after 3s:', JSON.stringify(later));

await browser.close();
