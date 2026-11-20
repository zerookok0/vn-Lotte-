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

/* 1) 弹窗（构建时已从 HTML 移除；若仍存在则 X 必须能关） */
const modalBefore = await page.evaluate(() => {
  const m = document.querySelector('.modal-welcome');
  return m ? getComputedStyle(m).display : 'absent';
});
if (modalBefore === 'absent') {
  ok('首页无欢迎弹窗（构建时已移除）', true, 'absent');
} else {
  await page.click('.modal-welcome .btn-close');
  await page.waitForTimeout(300);
  const modalAfter = await page.evaluate(() => {
    const m = document.querySelector('.modal-welcome');
    return m ? getComputedStyle(m).display : 'gone';
  });
  ok('弹窗 X 可关闭', modalBefore === 'block' && (modalAfter === 'none' || modalAfter === 'gone'), `${modalBefore} → ${modalAfter}`);
}

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

/* 3) 下拉菜单（排除门店选择器：那个已按需求禁用；只找真正带 menu 的） */
const pickToggle = () => [...document.querySelectorAll('.dropdown-toggle')]
  .find((e) => !e.closest('.locate-block') && e.closest('.dropdown') && e.closest('.dropdown').querySelector('.dropdown-menu'));

const dd = await page.evaluate(() => {
  const t = [...document.querySelectorAll('.dropdown-toggle')]
    .find((e) => !e.closest('.locate-block') && e.closest('.dropdown') && e.closest('.dropdown').querySelector('.dropdown-menu'));
  return t ? { exists: true, cls: t.className.slice(0, 40) } : { exists: false };
});
if (dd && dd.exists) {
  await page.evaluate(() => {
    [...document.querySelectorAll('.dropdown-toggle')]
      .find((e) => !e.closest('.locate-block') && e.closest('.dropdown') && e.closest('.dropdown').querySelector('.dropdown-menu'))
      .click();
  });
  await page.waitForTimeout(250);
  const opened = await page.evaluate(() => {
    const t = [...document.querySelectorAll('.dropdown-toggle')]
      .find((e) => !e.closest('.locate-block') && e.closest('.dropdown') && e.closest('.dropdown').querySelector('.dropdown-menu'));
    const menu = t.closest('.dropdown').querySelector('.dropdown-menu');
    return { show: menu.classList.contains('show'), display: getComputedStyle(menu).display };
  });
  ok('下拉菜单可展开', opened.show === true, JSON.stringify(opened));

  await page.evaluate(() => document.body.click());
  await page.waitForTimeout(200);
  const closed = await page.evaluate(() => {
    const t = [...document.querySelectorAll('.dropdown-toggle')]
      .find((e) => !e.closest('.locate-block') && e.closest('.dropdown') && e.closest('.dropdown').querySelector('.dropdown-menu'));
    return t.closest('.dropdown').querySelector('.dropdown-menu').classList.contains('show');
  });
  ok('点空白处收起下拉', closed === false);
} else {
  ok('下拉菜单可展开', false, 'no dropdown with menu found');
}

/* 3b) 门店下拉必须是禁用状态 */
const storeDrop = await page.evaluate(() => {
  const lb = document.querySelector('.locate-block');
  if (!lb) return { exists: false };
  const menu = lb.querySelector('.dropdown-menu');
  const toggle = lb.querySelector('.dropdown-toggle');
  return {
    exists: true,
    menuDisplay: menu ? getComputedStyle(menu).display : 'none',
    pointerEvents: toggle ? getComputedStyle(toggle).pointerEvents : 'auto',
  };
});
ok('门店下拉已禁用', !storeDrop.exists || (storeDrop.menuDisplay === 'none' && storeDrop.pointerEvents === 'none'), JSON.stringify(storeDrop));

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
