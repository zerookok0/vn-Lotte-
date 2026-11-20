/**
 * 验证首页欢迎弹窗能关掉
 *   node scripts/verify-popup.mjs
 */
import { chromium } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:8787';

const results = [];
const ok = (n, p, d = '') => { results.push({ n, p }); console.log(`  ${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

/* 1) 弹窗存在 + X 能关 */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(1200);

  const before = await page.evaluate(() => {
    const m = document.querySelector('.modal-welcome');
    return {
      exists: !!m,
      display: m ? getComputedStyle(m).display : null,
      backdrop: document.querySelectorAll('.modal-backdrop.show').length,
      bodyOverflow: getComputedStyle(document.body).overflow,
    };
  });
  ok('弹窗初始存在', before.exists, JSON.stringify(before));

  await page.click('.modal-welcome .btn-close');
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => {
    const m = document.querySelector('.modal-welcome');
    return {
      display: m ? getComputedStyle(m).display : null,
      backdrop: document.querySelectorAll('.modal-backdrop.show').length,
      bodyOverflow: getComputedStyle(document.body).overflow,
      clickable: (() => {
        // 用页面中部的实际命中测试：弹窗关掉后这里应该不再是遮罩/弹窗
        const probe = document.elementFromPoint(Math.round(window.innerWidth / 2), Math.round(window.innerHeight / 2));
        if (!probe) return false;
        return !probe.closest('.modal-welcome') && !probe.classList.contains('modal-backdrop');
      })(),
      headerClickable: (() => {
        const s = document.querySelector('#searchBoxHeader') || document.querySelector('header input, .header input');
        if (!s) return 'no-input';
        const r = s.getBoundingClientRect();
        const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!(el && (el === s || s.contains(el)));
      })(),
    };
  });
  ok('点 X 后弹窗隐藏', after.display === 'none', `display=${after.display}`);
  ok('遮罩一并隐藏', after.backdrop === 0, `count=${after.backdrop}`);
  ok('页面中部恢复可交互', after.clickable === true);
  ok('头部搜索框可点击', after.headerClickable === true, String(after.headerClickable));

  /* 2) 「今天不再显示」勾选后刷新不再弹 */
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const hasModal = await page.evaluate(() => !!document.querySelector('.modal-welcome'));
  ok('重新加载后弹窗重新出现（未勾选时不记住）', hasModal);

  // checkbox 是视觉隐藏的（靠 .checkmark 显示），直接置位再点 X
  await page.evaluate(() => {
    const cb = document.querySelector('.modal-welcome .checkbox-cs input[type="checkbox"]');
    if (cb) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await page.click('.modal-welcome .btn-close');
  await page.waitForTimeout(300);
  const stored = await page.evaluate(() => localStorage.getItem('ltm_popup_hidden_until'));
  ok('勾选后写入 localStorage', !!stored, stored);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const afterReload = await page.evaluate(() => {
    const m = document.querySelector('.modal-welcome');
    return m ? getComputedStyle(m).display : 'gone';
  });
  ok('刷新后不再显示弹窗', afterReload === 'none' || afterReload === 'gone', `display=${afterReload}`);

  await ctx.close();
}

await browser.close();

const failed = results.filter((r) => !r.p);
console.log(`\n=== ${results.length - failed.length}/${results.length} passed ===`);
if (failed.length) process.exitCode = 1;
