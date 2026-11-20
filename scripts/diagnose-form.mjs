import { chromium } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://127.0.0.1:8787';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
const page = await ctx.newPage();
await page.goto(BASE + '/?utm_source=fb', { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(800);
await page.evaluate(() => document.querySelector('.btn-cart').click());
await page.waitForTimeout(500);
await page.goto(BASE + '/checkout', { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(2000);

const before = await page.evaluate(() => ({
  tNameCount: document.querySelectorAll('#t-name').length,
  formId: document.getElementById('t-name')?.closest('form')?.id,
  formCount: document.querySelectorAll('form').length,
  tNameValue: document.getElementById('t-name')?.value,
  outerSnippet: document.getElementById('t-name')?.outerHTML.slice(0, 200),
}));
console.log('before fill:', JSON.stringify(before, null, 1));

await page.fill('#t-name', 'Nguyễn Văn A');
await page.waitForTimeout(300);
const after = await page.evaluate(() => ({
  tNameValue: document.getElementById('t-name')?.value,
  tNameCount: document.querySelectorAll('#t-name').length,
  activeTag: document.activeElement?.id,
  // 表单里所有 input 的 name/id/value
  inputs: [...document.querySelectorAll('#bp-form input, #bp-form select')].map((i) => ({ id: i.id, name: i.name, value: i.value, type: i.type })),
  formChildrenCount: document.getElementById('bp-form')?.children.length,
}));
console.log('after fill:', JSON.stringify(after, null, 1));

// 再等一会儿，看 connector 是否重建了 DOM
await page.waitForTimeout(2500);
const later = await page.evaluate(() => ({
  tNameValue: document.getElementById('t-name')?.value,
  tNameCount: document.querySelectorAll('#t-name').length,
  formCount: document.querySelectorAll('form').length,
  inputs: [...document.querySelectorAll('#bp-form input, #bp-form select')].map((i) => ({ id: i.id, value: i.value })),
}));
console.log('after 2.5s:', JSON.stringify(later, null, 1));

await browser.close();
