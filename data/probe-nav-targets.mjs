import { chromium } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const HOST = 'https://www.lottemart.vn';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 }, locale: 'vi-VN',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
});

const TITLES = ['Trang chủ', 'Đi Chợ Tại Nhà', 'Ưu Đãi Hot', 'Khuyến Mãi', 'Bán Chạy', 'Hàng Mới', 'Sự Kiện Nổi Bật', 'Đặt Hàng Nhanh'];
const result = {};

for (const title of TITLES) {
  const page = await ctx.newPage();
  try {
    await page.goto(HOST + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500);
    try {
      await page.locator('div.modal.show button', { hasText: /Nam Sài Gòn|Gò Vấp/ }).first().click({ timeout: 2500 });
      await page.waitForTimeout(400);
    } catch {}

    const before = page.url();
    const link = page.locator(`.top-nav a[title="${title}"], #navEl a[title="${title}"]`).first();
    if (!(await link.count())) { result[title] = { error: 'not found', before }; await page.close(); continue; }

    await Promise.all([
      page.waitForNavigation({ timeout: 8000 }).catch(() => null),
      link.click({ timeout: 5000 }).catch(() => null),
    ]);
    await page.waitForTimeout(1200);
    const after = page.url();
    result[title] = { before, after, changed: before !== after, path: new URL(after).pathname };
    console.log(`${title.padEnd(20)} -> ${result[title].path}${before === after ? '  (未跳转)' : ''}`);
  } catch (e) {
    result[title] = { error: String(e).slice(0, 80) };
    console.log(`${title.padEnd(20)} -> ERR ${String(e).slice(0, 60)}`);
  } finally {
    await page.close();
  }
}

console.log('\n=== JSON ===');
console.log(JSON.stringify(result, null, 1));

await browser.close();
