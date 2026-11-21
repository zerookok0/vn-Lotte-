import { chromium } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.argv[2] || 'https://vn-lotte.mating.workers.dev';
const PAGE = '/vi-nsg/tp3/gia-vi-nau-an';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
const page = await ctx.newPage();

const results = [];
const ok = (n, p, d = '') => { results.push({ n, p }); console.log(`  ${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };

/* 1. 分类图标 href */
await page.goto(BASE + PAGE, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(1500);

const icons = await page.evaluate(() => {
  const rows = [];
  document.querySelectorAll('#tp3Menu a').forEach((a) => {
    const img = a.querySelector('img.delivery-tab-logo');
    if (!img) return;
    rows.push({ title: a.getAttribute('title'), href: a.getAttribute('href') });
  });
  return rows;
});
console.log('  分类图标:', JSON.stringify(icons));
ok('分类图标都带 href', icons.length > 0 && icons.every((i) => i.href), `${icons.filter((i) => i.href).length}/${icons.length}`);

/* 2. 搜索框：输入 + Enter */
const inputs = await page.evaluate(() => [...document.querySelectorAll('input[name="q"], input[name="search_input"]')].length);
ok('页面有两个搜索输入框', inputs >= 2, String(inputs));

const box = page.locator('#tp3Menu input[name="search_input"]').first();
if (await box.count()) {
  await box.fill('dầu ăn');
  await box.press('Enter');
  await page.waitForTimeout(1800);
  const u1 = new URL(page.url());
  ok('搜索框 Enter 跳到 /search', u1.pathname === '/search' && u1.searchParams.get('q'), page.url());
} else {
  ok('搜索框 Enter 跳到 /search', false, '输入框不存在');
}

/* 3. 点头部搜索按钮 */
await page.goto(BASE + PAGE, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(1200);
const hdr = page.locator('#searchBoxHeader').first();
if (await hdr.count()) {
  await hdr.fill('nước mắm');
  await page.locator('.search-form button.btn-search').first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1600);
  const u2 = new URL(page.url());
  ok('头部搜索按钮可用', u2.pathname === '/search', page.url());
} else {
  ok('头部搜索按钮可用', false, 'header 输入框不存在');
}

/* 4. 分类图标点击 */
await page.goto(BASE + PAGE, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(1200);
const nav = await Promise.all([
  page.waitForNavigation({ timeout: 8000 }).catch(() => null),
  page.locator('#tp3Menu a[title="Gia vị nêm"]').first().click({ timeout: 5000 }).catch(() => {}),
]);
const u3 = new URL(page.url());
ok('点「Gia vị nêm」图标跳转', u3.pathname.startsWith('/vi-nsg/category/') || u3.pathname === '/search', page.url());

/* 5. tab 按钮 */
await page.goto(BASE + PAGE, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(1500);
const tabInfo = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.tab-ld-page-8 button, .tab-menu button')];
  return btns.slice(0, 8).map((b) => ({ title: b.getAttribute('title'), text: b.textContent.trim().slice(0, 20) }));
});
console.log('  tab 按钮:', JSON.stringify(tabInfo));

const tabBtn = page.locator('.tab-ld-page-8 button[title="Dầu oliu"]').first();
if (await tabBtn.count()) {
  const before = await page.evaluate(() => document.querySelectorAll('.field-name').length);
  await tabBtn.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() => {
    const visible = [...document.querySelectorAll('.item')].filter((el) => el.offsetParent !== null).length;
    return { visible, active: document.querySelector('.tab-ld-page-8 .swiper-slide-active button')?.getAttribute('title') };
  });
  ok('点 tab「Dầu oliu」有反应', after.visible !== before || after.active === 'Dầu oliu', JSON.stringify(after));
} else {
  ok('点 tab「Dầu oliu」有反应', false, 'tab 按钮不存在');
}

await browser.close();
const failed = results.filter((r) => !r.p);
console.log(`\n=== ${results.length - failed.length}/${results.length} passed ===`);
if (failed.length) process.exitCode = 1;
