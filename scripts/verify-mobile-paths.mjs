/**
 * 手机端路径验证：导航、分类翻页、商品页、触摸滑动
 *   node scripts/verify-mobile-paths.mjs [baseUrl]
 */
import { chromium, devices } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.argv[2] || 'https://vn-lotte.mating.workers.dev';

const results = [];
const ok = (n, p, d = '') => { results.push({ n, p }); console.log(`  ${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

const DEVICES = [
  ['iPhone 12', devices['iPhone 12']],
  ['Pixel 5', devices['Pixel 5']],
];

for (const [devName, dev] of DEVICES) {
  console.log(`\n########## ${devName} ##########`);
  const ctx = await browser.newContext({ ...dev, locale: 'vi-VN' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 100)));

  /* ---------- 1. 首页 ---------- */
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2200);
  await page.evaluate(() => {
    const o = document.getElementById('promo-overlay');
    if (o) o.remove();
    document.body.style.overflow = '';
  });

  const home = await page.evaluate(() => {
    const nav = [...document.querySelectorAll('.top-nav a, #navEl a')].map((a) => ({
      title: a.getAttribute('title'),
      href: a.getAttribute('href'),
    }));
    const overflow = document.documentElement.scrollWidth - window.innerWidth;
    const addBtns = document.querySelectorAll('.btn-cart').length;
    return { nav, overflow, addBtns };
  });
  const deadNav = home.nav.filter((n) => !n.href || n.href === '#' || n.href === 'javascript:void(0)');
  ok(`[${devName}] 顶部导航无死链`, deadNav.length === 0, `${home.nav.length} 项，死链 ${deadNav.length}`);
  ok(`[${devName}] 首页无横向溢出`, home.overflow <= 2, `溢出 ${home.overflow}px`);
  ok(`[${devName}] 首页有加购按钮`, home.addBtns > 0, `${home.addBtns} 个`);

  /* 点「Trang chủ」应留/回首页 */
  const homeClick = await page.evaluate(async () => {
    const a = [...document.querySelectorAll('.top-nav a, #navEl a')].find((x) => x.getAttribute('title') === 'Trang chủ');
    if (!a) return { found: false };
    return { found: true, href: a.getAttribute('href') };
  });
  ok(`[${devName}] 「Trang chủ」指向 /`, homeClick.found && homeClick.href === '/', JSON.stringify(homeClick));

  /* ---------- 2. 分类页 + Xem thêm ---------- */
  await page.goto(BASE + '/vi-nsg/category/dau-an-c201', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const o = document.getElementById('promo-overlay');
    if (o) o.remove();
    document.body.style.overflow = '';
  });

  /* 滚到按钮位置（懒加载/可见性） */
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight - 1200));
  await page.waitForTimeout(1200);

  const before = await page.evaluate(() => ({
    cards: document.querySelectorAll('.item:has(.field-price)').length,
    hasBtn: !!document.querySelector('.clone-loadmore'),
    btnVisible: (() => {
      const b = document.querySelector('.clone-loadmore');
      if (!b) return false;
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    })(),
    meta: document.querySelector('.clone-loadmore-meta')?.textContent || '',
    overflow: document.documentElement.scrollWidth - window.innerWidth,
  }));
  ok(`[${devName}] 分类页出现 Xem thêm`, before.hasBtn && before.btnVisible, `${before.cards} 张卡 / ${before.meta}`);
  ok(`[${devName}] 分类页无横向溢出`, before.overflow <= 2, `溢出 ${before.overflow}px`);

  if (before.hasBtn) {
    await page.locator('.clone-loadmore').scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(600);
    await page.locator('.clone-loadmore').tap().catch(async () => {
      await page.locator('.clone-loadmore').click().catch(() => {});
    });
    await page.waitForTimeout(3000);
    const after = await page.evaluate(() => ({
      cards: document.querySelectorAll('.item:has(.field-price)').length,
      meta: document.querySelector('.clone-loadmore-meta')?.textContent || '',
    }));
    ok(`[${devName}] 手机上点 Xem thêm 能加载`, after.cards > before.cards, `${before.cards} → ${after.cards}  ${after.meta}`);
  }

  /* ---------- 3. 面包屑回首页 ---------- */
  const bc = await page.evaluate(() => {
    const a = document.querySelector('.breadcrumb a[title="Trang chủ"]');
    return a ? a.getAttribute('href') : null;
  });
  ok(`[${devName}] 分类页面包屑回首页`, bc === '/', String(bc));

  /* ---------- 4. 商品页 ---------- */
  const prodUrl = '/vi-nsg/product/chanh-khong-hat-500g-8935268200836-p228894';
  await page.goto(BASE + prodUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2200);
  await page.evaluate(() => {
    const o = document.getElementById('promo-overlay');
    if (o) o.remove();
    document.body.style.overflow = '';
  });

  const prod = await page.evaluate(() => {
    const btn = document.querySelector('button[title="Thêm vào giỏ hàng"]');
    const img = document.querySelector('.swiper-gallery img, .field-img img');
    const price = document.querySelector('.field-price');
    return {
      hasAdd: !!btn,
      addRect: btn ? { w: Math.round(btn.getBoundingClientRect().width), h: Math.round(btn.getBoundingClientRect().height) } : null,
      imgOk: img ? (img.complete && img.naturalWidth > 0) : false,
      price: price?.textContent?.trim() || '',
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      hasBreadcrumb: !!document.querySelector('.breadcrumb a[title="Trang chủ"]'),
    };
  });
  ok(`[${devName}] 商品页加购按钮可点`, prod.hasAdd && prod.addRect && prod.addRect.h >= 32, JSON.stringify(prod.addRect));
  ok(`[${devName}] 商品页主图正常`, prod.imgOk === true);
  ok(`[${devName}] 商品页无横向溢出`, prod.overflow <= 2, `溢出 ${prod.overflow}px`);
  ok(`[${devName}] 商品页面包屑在`, prod.hasBreadcrumb === true);

  /* 点加购 */
  if (prod.hasAdd) {
    await page.evaluate(() => {
      const b = document.querySelector('button[title="Thêm vào giỏ hàng"]');
      if (b) b.click();
    });
    await page.waitForTimeout(1200);
    const cart = await page.evaluate(() => ({
      badge: document.querySelector('.clone-badge')?.textContent?.trim(),
      count: (window.__BP_CART__?.items || []).length,
    }));
    ok(`[${devName}] 加购生效`, cart.count > 0 || !!cart.badge, JSON.stringify(cart));
  }

  /* ---------- 5. 横向滑动区 ---------- */
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2200);
  const swipe = await page.evaluate(() => {
    /* 只认可真正滚动的容器（overflow auto/scroll），外层 swiper 是 overflow:hidden */
    const candidates = [...document.querySelectorAll('.swiper-wrapper, [class*="swipe"], [class*="scroll"]')]
      .filter((el) => {
        const cs = getComputedStyle(el);
        return /auto|scroll/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 20;
      });
    if (!candidates.length) return { count: 0, scrolled: false };
    const el = candidates[0];
    const before = el.scrollLeft;
    el.scrollLeft = 300;
    return {
      count: candidates.length,
      scrolled: el.scrollLeft > before,
      cls: el.className.toString().slice(0, 40),
      scrollW: el.scrollWidth,
      clientW: el.clientWidth,
    };
  });
  ok(`[${devName}] 存在可横滑区域`, swipe.count > 0 && swipe.scrolled === true, JSON.stringify(swipe));

  ok(`[${devName}] 无 JS 异常`, errs.length === 0, errs[0] || '');

  await page.screenshot({ path: `data/raw/shots/mobile-${devName.replace(/\s/g, '')}.png`, fullPage: false });
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.p);
console.log(`\n=== ${results.length - failed.length}/${results.length} passed ===`);
if (failed.length) { failed.forEach((f) => console.log('  ✗ ' + f.n)); process.exitCode = 1; }
