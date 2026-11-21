/**
 * 完整对照验证：桌面 + 手机
 *   node scripts/verify-full-parity.mjs [baseUrl]
 */
import { chromium, devices } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:8787';

const EXPECT_NAV = {
  'Trang chủ': '/',
  'Giao 60 PHÚT': '/vi-nsg/tp3/giao-hang-sieu-toc',
  'Đi Chợ Tại Nhà': '/vi-nsg/tp3/fresh-food?isGNB=true',
  'Ưu Đãi Hot': '/vi-nsg/e-catalogue',
  'Khuyến Mãi': '/vi-nsg/promotion',
  'Bán Chạy': '/vi-nsg/best',
  'Hàng Mới': '/vi-nsg/new-arrival',
  'Sự Kiện Nổi Bật': '/vi-nsg/event',
  'Đặt Hàng Nhanh': '/login?callbackUrl=/vi-nsg/quick-order',
};

const results = [];
const ok = (n, p, d = '') => { results.push({ n, p }); console.log(`  ${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

for (const [devName, dev] of [
  ['Desktop 1440', { viewport: { width: 1440, height: 900 } }],
  ['iPhone 12', devices['iPhone 12']],
  ['Pixel 5', devices['Pixel 5']],
]) {
  console.log(`\n########## ${devName} ##########`);
  const ctx = await browser.newContext({ ...dev, locale: 'vi-VN' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 90)));

  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2400);
  await page.evaluate(() => {
    const o = document.getElementById('promo-overlay');
    if (o) o.remove();
    document.body.style.overflow = '';
  });

  /* 1. 顶部 9 项 */
  const nav = await page.evaluate(() => {
    const m = {};
    document.querySelectorAll('.top-nav a[title], #navEl a[title]').forEach((a) => {
      const t = a.getAttribute('title');
      if (!(t in m)) m[t] = a.getAttribute('href');
    });
    return m;
  });
  let navOk = 0;
  const navBad = [];
  for (const [t, expect] of Object.entries(EXPECT_NAV)) {
    if (nav[t] === expect) navOk++;
    else navBad.push(`${t}: ${nav[t]} ≠ ${expect}`);
  }
  ok(`[${devName}] 顶部 9 项指向原站真实页面`, navOk === 9, `${navOk}/9 ${navBad.slice(0, 2).join(' | ')}`);

  /* 2. 4 个新菜单页可访问 */
  const pages = ['/vi-nsg/e-catalogue', '/vi-nsg/best', '/vi-nsg/new-arrival', '/vi-nsg/event'];
  let pageOk = 0;
  for (const p of pages) {
    const r = await page.goto(BASE + p, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => null);
    if (r && r.status() === 200) pageOk++;
  }
  ok(`[${devName}] 4 个新菜单页 200`, pageOk === 4, `${pageOk}/4`);

  /* 3. 商品图尺寸 */
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2400);
  await page.evaluate(() => { const o = document.getElementById('promo-overlay'); if (o) o.remove(); });
  await page.evaluate(async () => {
    for (let y = 0; y < 3000; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 140)); }
  });
  await page.waitForTimeout(900);

  const img = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.item')].filter((el) => el.querySelector('.field-img span'));
    const bad = [];
    let good = 0;
    for (const c of cards) {
      const span = c.querySelector('.field-img span');
      const wrap = span.closest('.field-img');
      const sw = Math.round(span.getBoundingClientRect().width);
      const ww = Math.round(wrap.getBoundingClientRect().width);
      if (Math.abs(sw - ww) <= 2) good++;
      else if (bad.length < 3) bad.push(`${sw} vs ${ww}`);
    }
    return { total: cards.length, good, bad };
  });
  ok(`[${devName}] 商品图铺满容器（不错版）`, img.total > 0 && img.good === img.total, `${img.good}/${img.total} ${img.bad.join(',')}`);

  /* 4. 首页 tab 切换 */
  const tabResult = await page.evaluate(async () => {
    const S = '.section.top-products';
    const sec = document.querySelector(S);
    if (!sec) return { found: false };
    const btns = [...sec.querySelectorAll('.tab-menu button[title]')];
    const grid = sec.querySelector('.tab-content .swiper-wrapper');
    if (!grid) return { found: false };
    const read = () => [...grid.querySelectorAll('.field-name')].slice(0, 2).map((e) => e.textContent.trim().slice(0, 22));
    const out = [];
    for (const b of btns.slice(0, 5)) {
      b.click();
      await new Promise((r) => setTimeout(r, 1500));
      out.push({ tab: b.getAttribute('title'), first: read()[0] || '' });
    }
    return { found: true, tabs: btns.length, out };
  });
  if (tabResult.found) {
    const distinct = new Set(tabResult.out.map((x) => x.first)).size;
    ok(`[${devName}] 首页 tab 能切换商品`, distinct >= 3, `${tabResult.tabs} 个 tab，${distinct} 种不同首商品: ${tabResult.out.map((x) => x.tab + '→' + (x.first || '空')).join(' | ').slice(0, 160)}`);
  } else {
    ok(`[${devName}] 首页 tab 能切换商品`, false, '区块或网格未找到');
  }

  /* 5. 无横向溢出 */
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(`[${devName}] 无横向溢出`, overflow <= 2, `${overflow}px`);

  ok(`[${devName}] 无 JS 异常`, errs.length === 0, errs[0] || '');

  await page.screenshot({ path: `data/raw/shots/parity-${devName.replace(/\s/g, '')}.png` });
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.p);
console.log(`\n=== ${results.length - failed.length}/${results.length} passed ===`);
if (failed.length) { failed.forEach((f) => console.log('  ✗ ' + f.n)); process.exitCode = 1; }
