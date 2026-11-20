import { chromium } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:8787/checkout', { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(1200);

const info = await page.evaluate(() => {
  const sel = (s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    return { tag: el.tagName, id: el.id, name: el.getAttribute('name'), cls: String(el.className).slice(0, 40), inForm: el.form ? el.form.id : null, value: el.value };
  };
  return {
    nameSelector: sel('input[name="name"]'),
    nameSelectorAll: [...document.querySelectorAll('input[name="name"]')].map((e) => ({ id: e.id, inForm: e.form?.id })),
    emailSelector: sel('input[name="email"]'),
    phoneSelector: sel('input[name="phone"]'),
    addrSelector: sel('input[autocomplete="address-line1"]'),
    allNamedInputs: [...document.querySelectorAll('input[name]')].map((e) => ({ name: e.getAttribute('name'), id: e.id, form: e.form?.id })),
  };
});
console.log(JSON.stringify(info, null, 1));

await browser.close();
