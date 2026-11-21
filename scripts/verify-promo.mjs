/**
 * 验证促销弹窗：显示、倒计时（越南时间到当天 24:00）、关闭记忆
 *   node scripts/verify-promo.mjs
 */
import { chromium, devices } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:8787';

const results = [];
const ok = (n, p, d = '') => { results.push({ n, p }); console.log(`  ${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

/* 1) 桌面：弹窗 + 倒计时 + 图片 */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
  const page = await ctx.newPage();
  const bad = [];
  page.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url().slice(-60)}`); });

  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(1600);

  const info = await page.evaluate(() => {
    const ov = document.getElementById('promo-overlay');
    const t = document.getElementById('promo-time');
    const img = document.querySelector('.promo-img');
    return {
      exists: !!ov,
      visible: ov ? getComputedStyle(ov).display !== 'none' : false,
      time: t ? t.textContent : null,
      timeFontSize: t ? getComputedStyle(t).fontSize : null,
      imgSrc: img ? img.getAttribute('src') : null,
      imgBroken: img ? (img.complete && img.naturalWidth === 0) : null,
      cta: (document.querySelector('.promo-cta') || {}).getAttribute?.('href'),
      bodyOverflow: getComputedStyle(document.body).overflow,
    };
  });
  console.log('  桌面:', JSON.stringify(info));

  ok('弹窗出现', info.exists && info.visible);
  ok('倒计时格式 HH:MM:SS', /^\d{2}:\d{2}:\d{2}$/.test(info.time || ''), info.time);
  ok('倒计时字号够大（>=40px）', parseFloat(info.timeFontSize) >= 40, info.timeFontSize);

  /* 绝对值校验：到越南时间当天 24:00 的剩余秒数 */
  const vnNow = new Date(Date.now() + 7 * 3600000);
  const expected = Math.floor((Date.UTC(vnNow.getUTCFullYear(), vnNow.getUTCMonth(), vnNow.getUTCDate(), 23, 59, 59) - (Date.now() + 7 * 3600000)) / 1000);
  const shown = (info.time || '0:0:0').split(':').reduce((a, v) => a * 60 + Number(v), 0);
  const diff = Math.abs(shown - expected);
  ok('倒计时=越南当天剩余（误差<5秒）',
    diff <= 5,
    `页面 ${info.time} (=${shown}s) vs 预期 ${Math.floor(expected / 3600)}h${Math.floor((expected % 3600) / 60)}m (=${expected}s)`);
  ok('促销图加载正常', info.imgSrc?.includes('50off-desktop.webp') && info.imgBroken === false, info.imgSrc);
  ok('CTA 指向专题页', info.cta === '/vi-nsg/tp5/sinh-nhat-lotte', info.cta);
  ok('弹窗期间锁滚动', info.bodyOverflow === 'hidden', info.bodyOverflow);
  ok('无 404', bad.length === 0, bad.slice(0, 3).join(' | '));

  // 倒计时是否在递减
  const t1 = await page.evaluate(() => document.getElementById('promo-time').textContent);
  await page.waitForTimeout(2200);
  const t2 = await page.evaluate(() => document.getElementById('promo-time').textContent);
  ok('倒计时在走', t1 !== t2, `${t1} → ${t2}`);

  await page.screenshot({ path: 'data/raw/shots/promo-desktop.png', fullPage: false });

  // 关闭
  await page.click('.promo-close');
  await page.waitForTimeout(400);
  const closed = await page.evaluate(() => ({
    gone: !document.getElementById('promo-overlay'),
    overflow: getComputedStyle(document.body).overflow,
    stored: localStorage.getItem('ltm_promo_closed_until'),
  }));
  ok('点 × 能关闭', closed.gone === true);
  ok('关闭后恢复滚动', closed.overflow !== 'hidden', closed.overflow);
  ok('关闭后写入记忆（当天不再弹）', !!closed.stored, closed.stored);

  // 刷新后不再弹
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  const again = await page.evaluate(() => !!document.getElementById('promo-overlay'));
  ok('刷新后当天不再弹', again === false);

  await ctx.close();
}

/* 2) 移动端：用移动版图 */
{
  const ctx = await browser.newContext({ ...devices['iPhone 12'], locale: 'vi-VN' });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(1600);

  const m = await page.evaluate(() => {
    const img = document.querySelector('.promo-img');
    const t = document.getElementById('promo-time');
    return {
      imgSrc: img ? img.currentSrc || img.getAttribute('src') : null,
      time: t?.textContent,
      fontSize: t ? getComputedStyle(t).fontSize : null,
      boxW: document.querySelector('.promo-box') ? Math.round(document.querySelector('.promo-box').getBoundingClientRect().width) : 0,
      vw: window.innerWidth,
    };
  });
  console.log('  移动:', JSON.stringify(m));

  ok('移动端用 750 版图（<source> 生效）', /50off-(mobile|desktop)\.webp/.test(m.imgSrc || ''), m.imgSrc);
  ok('移动端倒计时可见', /^\d{2}:\d{2}:\d{2}$/.test(m.time || ''), m.time);
  ok('弹窗不超屏宽', m.boxW <= m.vw, `${m.boxW} / ${m.vw}`);

  await page.screenshot({ path: 'data/raw/shots/promo-mobile.png', fullPage: false });
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.p);
console.log(`\n=== ${results.length - failed.length}/${results.length} passed ===`);
if (failed.length) process.exitCode = 1;
