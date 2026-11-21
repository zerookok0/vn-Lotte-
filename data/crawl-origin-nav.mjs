import { chromium } from 'playwright-core';
import { writeFile } from 'node:fs/promises';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const HOST = 'https://www.lottemart.vn';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 }, locale: 'vi-VN',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
});
const page = await ctx.newPage();
await page.goto(HOST + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(3000);
try {
  await page.locator('div.modal.show button', { hasText: /Nam Sài Gòn|Gò Vấp/ }).first().click({ timeout: 3000 });
  await page.waitForTimeout(600);
} catch {}

/* 顶部导航 */
const nav = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('.top-nav a, #navEl a').forEach((a) => {
    out.push({
      title: a.getAttribute('title') || '',
      text: (a.textContent || '').trim().slice(0, 30),
      href: a.getAttribute('href') || '',
    });
  });
  return out;
});
console.log('=== 顶部导航 (top-nav) ===');
nav.forEach((n) => console.log(`  ${JSON.stringify(n.href).padEnd(46)} ${n.title || n.text}`));

/* 分类菜单 Danh Mục 的项 */
const cats = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('.cate-menu a, .menu-cate a, .mega-menu a, .nav-cate a').forEach((a) => {
    const href = a.getAttribute('href') || '';
    if (href && href !== '#' && href !== 'javascript:void(0)') {
      out.push({ title: a.getAttribute('title') || '', href });
    }
  });
  return out.slice(0, 20);
});
console.log('\n=== 分类菜单 ===');
cats.forEach((c) => console.log(`  ${c.href.padEnd(52)} ${c.title}`));

/* 页脚里也可能有 */
const footer = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('footer a, .footer a').forEach((a) => {
    const href = a.getAttribute('href') || '';
    if (href && href !== '#' && href !== 'javascript:void(0)') out.push({ text: (a.textContent || '').trim().slice(0, 26), href });
  });
  return out.slice(0, 30);
});
console.log('\n=== 页脚链接 ===');
footer.forEach((c) => console.log(`  ${c.href.padEnd(52)} ${c.text}`));

await writeFile('data/nav-origin.json', JSON.stringify({ nav, cats, footer }, null, 2), 'utf8');
console.log('\n写入 data/nav-origin.json');

await browser.close();
