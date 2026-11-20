/**
 * 探测原站还有哪些「能抓」的页面：分页、专题页、静态内容页。
 *   node scripts/probe-more.mjs
 */
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

/* 1) 分类页分页：点「Xem thêm」看 URL / 请求怎么变 */
const reqs = [];
page.on('request', (r) => {
  const u = r.url();
  if (/\/v1\/p\/mart\/es\//.test(u)) reqs.push(u.slice(0, 160));
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

const before = await page.evaluate(() => ({
  url: location.href,
  cards: document.querySelectorAll('a[href*="/vi-nsg/product/"]').length,
  moreBtn: (() => {
    const b = [...document.querySelectorAll('button, a')].find((e) => /xem thêm|Xem thêm/i.test(e.textContent || ''));
    return b ? { tag: b.tagName, cls: b.className.slice(0, 60), text: b.textContent.trim().slice(0, 30) } : null;
  })(),
}));
console.log('分类页初始:', JSON.stringify(before, null, 1));

const reqBefore = reqs.length;
try {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button, a')].find((e) => /xem thêm/i.test(e.textContent || ''));
    if (b) b.click();
  });
  await page.waitForTimeout(3000);
} catch (e) { console.log('点更多失败', String(e).slice(0, 80)); }

const after = await page.evaluate(() => ({
  url: location.href,
  cards: document.querySelectorAll('a[href*="/vi-nsg/product/"]').length,
  scrollH: document.body.scrollHeight,
  pagination: [...document.querySelectorAll('.pagination a, [class*="paging"] a, a[href*="page="]')].slice(0, 5).map((a) => a.getAttribute('href')),
}));
console.log('点「Xem thêm」后:', JSON.stringify(after, null, 1));
console.log('新增 API 请求:', reqs.slice(reqBefore));

/* 2) 直接试 query 参数分页 */
for (const q of ['?p=2', '?page=2', '?page_number=2']) {
  const r = await page.goto(HOST + '/vi-nsg/category/rau-cu-c3' + q, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => null);
  await page.waitForTimeout(2000);
  const info = await page.evaluate(() => ({
    url: location.href,
    first: (document.querySelector('.field-name a') || {}).textContent?.trim().slice(0, 40),
  }));
  console.log(`  ${q} →`, JSON.stringify(info));
}

/* 3) 专题页 / 静态内容页是否存在 */
const candidates = [
  '/vi-nsg/tp3/giao-hang-sieu-toc',
  '/vi-nsg/tp5/sinh-nhat-lotte',
  '/vi-nsg/about-us',
  '/vi-nsg/privacy',
  '/vi-nsg/faq',
  '/vi-nsg/shipping-delivery',
  '/vi-nsg/exchange-refund',
  '/vi-nsg/account-management',
  '/vi-nsg/membership-policy',
  '/vi-nsg/my-page/recently-viewed',
];
console.log('\n静态/专题页探测:');
for (const p of candidates) {
  const r = await page.goto(HOST + p, { waitUntil: 'domcontentloaded', timeout: 40000 }).catch(() => null);
  const code = r ? r.status() : 0;
  const t = await page.title().catch(() => '');
  console.log(`  ${String(code).padEnd(4)} ${p.padEnd(42)} ${t.slice(0, 40)}`);
}

await browser.close();
