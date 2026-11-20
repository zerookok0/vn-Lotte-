import { chromium } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const HOST = 'https://www.lottemart.vn';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'vi-VN',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
});
const page = await ctx.newPage();

const urls = [];
page.on('request', (r) => {
  const u = r.url();
  if (/categories\/\d+\/products/.test(u)) urls.push({ url: u, method: r.method(), postData: r.postData() });
});

await page.goto(HOST + '/vi-nsg/category/rau-cu-c3', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(2500);
try {
  await page.locator('div.modal.show button', { hasText: /Nam Sài Gòn|Gò Vấp/ }).first().click({ timeout: 2500 });
  await page.waitForTimeout(400);
} catch {}
for (const sel of ['button:has-text("Xác nhận")', 'button:has-text("Đã hiểu")']) {
  try { await page.click(sel, { timeout: 1200 }); await page.waitForTimeout(300); } catch {}
}

// 滚到底触发「加载更多」
for (let i = 0; i < 6; i++) {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1800);
}

console.log(`捕获 ${urls.length} 个商品列表请求：`);
urls.slice(0, 10).forEach((u, i) => {
  console.log(`\n[${i}] ${u.method} ${u.url}`);
  if (u.postData) console.log('    body:', u.postData.slice(0, 300));
});

const cards = await page.evaluate(() => document.querySelectorAll('a[href*="/vi-nsg/product/"]').length);
console.log('\n滚动后页面商品卡数:', cards);

await browser.close();
