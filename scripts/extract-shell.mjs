/* [ltm-clone] LOTTE Mart Vietnam — storefront clone (sandbox fixture)
 * visual reference: https://www.lottemart.vn/ (snapshot 2026-11-20)
 * for internal testing / demo use only — not affiliated with LOTTE Mart
 */
/**
 * 从克隆首页抽出 header / footer 壳，供自建页面（购物车、结账、成功页）复用。
 *   node scripts/extract-shell.mjs
 */
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('.');
const OUT = path.join(ROOT, 'data', 'raw', 'shell');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:8787/', { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(1000);

const shell = await page.evaluate(() => {
  const header = document.querySelector('.header-app');
  const footer = document.querySelector('footer') || [...document.querySelectorAll('section,div')].reverse().find((el) => /footer/i.test(el.className));
  return {
    headerHTML: header ? header.outerHTML : null,
    footerHTML: footer ? footer.outerHTML : null,
    footerTag: footer ? footer.tagName + '.' + footer.className : null,
    title: document.title,
  };
});

console.log('footer element:', shell.footerTag);
console.log('header len:', shell.headerHTML?.length, 'footer len:', shell.footerHTML?.length);

await writeFile(path.join(OUT, 'header.html'), shell.headerHTML || '', 'utf8');
await writeFile(path.join(OUT, 'footer.html'), shell.footerHTML || '', 'utf8');

// 头部角标元素定位（购物车数量）
const badge = await page.evaluate(() => {
  const candidates = [...document.querySelectorAll('.header-app *')].filter((el) => /cart/i.test(el.className || '') || /gio-hang/i.test(el.getAttribute('href') || ''));
  return candidates.slice(0, 8).map((el) => ({ tag: el.tagName, cls: el.className, href: el.getAttribute('href'), html: el.outerHTML.slice(0, 260) }));
});
console.log('\ncart badge candidates:');
badge.forEach((b) => console.log('  ', JSON.stringify(b).slice(0, 300)));

await browser.close();
