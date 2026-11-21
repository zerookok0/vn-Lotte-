/**
 * 验证门店选择器已被移除，且 header 布局没塌
 *   node scripts/verify-locate.mjs
 */
import { chromium } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:8787';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

for (const [label, vw, vh] of [['桌面', 1440, 900], ['移动', 390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, locale: 'vi-VN' });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(1200);

  const r = await page.evaluate(() => {
    const loc = document.querySelector('.locate-block');
    const logo = document.querySelector('.header-app h1.logo, .header-app .logo');
    const search = document.querySelector('.header-app input[name="q"], .header-app input[placeholder]');
    const box = (el) => (el ? { w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) } : null);
    return {
      locateExists: !!loc,
      locateDisplay: loc ? getComputedStyle(loc).display : null,
      locateVisible: loc ? (loc.getBoundingClientRect().width > 0 && getComputedStyle(loc).display !== 'none') : false,
      logo: box(logo),
      search: box(search),
      headerH: Math.round((document.querySelector('.header-app') || document.body).getBoundingClientRect().height),
      hasStoreText: /Nam Sài Gòn/.test(document.querySelector('.header-app')?.innerText || ''),
    };
  });

  console.log(`\n=== ${label} (${vw}px) ===`);
  console.log(JSON.stringify(r, null, 1));
  console.log(r.locateVisible === false ? '  ✓ 门店选择器不可见' : '  ✗ 门店选择器还看得见');
  console.log(r.logo && r.logo.w > 0 ? '  ✓ logo 正常显示' : '  ✗ logo 异常');

  await page.screenshot({ path: `data/raw/shots/locate-${vw}.png`, fullPage: false });
  await ctx.close();
}

await browser.close();
