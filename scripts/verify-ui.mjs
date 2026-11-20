/**
 * 验证首页交互补丁：弹窗关闭 / 轮播箭头 / 下拉菜单
 *   node scripts/verify-ui.mjs
 */
import { chromium } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:8787';

const results = [];
const ok = (n, p, d = '') => { results.push({ n, p }); console.log(`  ${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));

await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(1200);

/* 1) 弹窗 */
const modalBefore = await page.evaluate(() => getComputedStyle(document.querySelector('.modal-welcome')).display);
await page.click('.modal-welcome .btn-close');
await page.waitForTimeout(300);
const modalAfter = await page.evaluate(() => getComputedStyle(document.querySelector('.modal-welcome')).display);
ok('弹窗 X 可关闭', modalBefore === 'block' && modalAfter === 'none', `${modalBefore} → ${modalAfter}`);

/* 2) 轮播：主 banner（第一个带 next 箭头的 swiper） */
const sw = await page.evaluate(() => {
  const el = [...document.querySelectorAll('.swiper')].find((s) => s.querySelector('.swiper-button-next') && s.querySelector('.swiper-wrapper'));
  if (!el) return null;
  const w = el.querySelector('.swiper-wrapper');
  return { before: w.style.transform, total: w.children.length };
});
if (sw) {
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('.swiper')].find((s) => s.querySelector('.swiper-button-next') && s.querySelector('.swiper-wrapper'));
    el.querySelector('.swiper-button-next').click();
  });
  await page.waitForTimeout(450);
  const after = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.swiper')].find((s) => s.querySelector('.swiper-button-next') && s.querySelector('.swiper-wrapper'));
    return el.querySelector('.swiper-wrapper').style.transform;
  });
  ok('轮播 next 改变位移', after !== sw.before, `${sw.before || '(none)'} → ${after}`);
} else {
  ok('轮播 next 改变位移', false, 'no swiper found');
}

/* 3) 下拉菜单 */
const dd = await page.evaluate(() => {
  const t = document.querySelector('.dropdown-toggle');
  if (!t) return null;
  const ddEl = t.closest('.dropdown');
  const menu = ddEl && ddEl.querySelector('.dropdown-menu');
  return menu ? { exists: true, shown: menu.classList.contains('show') } : { exists: false };
});
if (dd && dd.exists) {
  await page.evaluate(() => document.querySelector('.dropdown-toggle').click());
  await page.waitForTimeout(250);
  const opened = await page.evaluate(() => {
    const t = document.querySelector('.dropdown-toggle');
    const menu = t.closest('.dropdown').querySelector('.dropdown-menu');
    return { show: menu.classList.contains('show'), display: getComputedStyle(menu).display };
  });
  ok('下拉菜单可展开', opened.show === true, JSON.stringify(opened));

  await page.evaluate(() => document.body.click());
  await page.waitForTimeout(200);
  const closed = await page.evaluate(() => {
    const t = document.querySelector('.dropdown-toggle');
    const menu = t.closest('.dropdown').querySelector('.dropdown-menu');
    return menu.classList.contains('show');
  });
  ok('点空白处收起下拉', closed === false);
} else {
  ok('下拉菜单可展开', false, 'no dropdown found');
}

/* 4) 加购仍然正常 */
const cartBefore = await page.evaluate(() => (window.LTM ? window.LTM.cart().length : -1));
await page.evaluate(() => document.querySelector('.btn-cart').click());
await page.waitForTimeout(400);
const cartAfter = await page.evaluate(() => (window.LTM ? window.LTM.cart().length : -1));
ok('加购按钮仍工作', cartAfter === cartBefore + 1, `${cartBefore} → ${cartAfter}`);

ok('无 JS 异常', errs.length === 0, errs[0] || '');

await browser.close();
const failed = results.filter((r) => !r.p);
console.log(`\n=== ${results.length - failed.length}/${results.length} passed ===`);
if (failed.length) process.exitCode = 1;
