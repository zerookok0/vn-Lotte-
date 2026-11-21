import { chromium } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.argv[2] || 'https://vn-lotte.mating.workers.dev';

const results = [];
const ok = (n, p, d = '') => { results.push({ n, p }); console.log(`  ${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));

/* 挑一个大分类（dau-an-c201 有 120 个） */
const CASES = [
  ['/vi-nsg/category/dau-an-c201', 120],
  ['/vi-nsg/category/ban-chai-danh-rang-c704', 77],
];

for (const [path, expected] of CASES) {
  console.log(`\n=== ${path} （分类应有 ${expected} 个商品）===`);
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2200);

  const init = await page.evaluate(() => ({
    cards: document.querySelectorAll('.item:has(.field-price)').length,
    hasBtn: !!document.querySelector('.clone-loadmore'),
    meta: document.querySelector('.clone-loadmore-meta')?.textContent || '',
  }));
  console.log('  初始:', JSON.stringify(init));
  ok('初始商品卡存在', init.cards > 0, `${init.cards} 张`);
  ok('出现「Xem thêm」按钮', init.hasBtn === true);

  const before = init.cards;
  await page.click('.clone-loadmore', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const after1 = await page.evaluate(() => ({
    cards: document.querySelectorAll('.item:has(.field-price)').length,
    meta: document.querySelector('.clone-loadmore-meta')?.textContent || '',
    btnText: document.querySelector('.clone-loadmore')?.textContent || '',
  }));
  console.log('  点一次后:', JSON.stringify(after1));
  ok('点一次追加了商品', after1.cards > before, `${before} → ${after1.cards}`);
  ok('计数文案更新', /Đã hiển thị/.test(after1.meta), after1.meta);

  /* 连续点到没有更多 */
  let clicks = 0;
  while (clicks < 12) {
    const st = await page.evaluate(() => {
      const b = document.querySelector('.clone-loadmore');
      return { visible: !!b && getComputedStyle(b).display !== 'none', cards: document.querySelectorAll('.item:has(.field-price)').length };
    });
    if (!st.visible) break;
    await page.click('.clone-loadmore', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1400);
    clicks++;
  }
  const final = await page.evaluate(() => ({
    cards: document.querySelectorAll('.item:has(.field-price)').length,
    btnGone: (() => { const b = document.querySelector('.clone-loadmore'); return !b || getComputedStyle(b).display === 'none'; })(),
    meta: document.querySelector('.clone-loadmore-meta')?.textContent || '',
    brokenImgs: [...document.querySelectorAll('img')].filter((i) => i.complete && i.naturalWidth === 0 && i.getAttribute('src')).length,
  }));
  console.log(`  连点 ${clicks} 次后:`, JSON.stringify(final));
  ok('加载到全部分类商品', final.cards >= expected * 0.9, `${final.cards} / ${expected}`);
  ok('加载完后按钮隐藏', final.btnGone === true);
  ok('新卡片无破图', final.brokenImgs === 0);

  /* 抽查一张新卡片的内容完整性 */
  const sample = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.item:has(.field-price)')];
    const el = items[items.length - 1];
    return {
      name: el.querySelector('.field-name')?.textContent?.trim().slice(0, 40),
      price: el.querySelector('.field-price')?.textContent?.trim(),
      old: el.querySelector('.field-price-old')?.textContent?.trim(),
      href: el.querySelector('a[href*="/vi-nsg/product/"]')?.getAttribute('href')?.slice(0, 50),
      bg: (el.querySelector('.field-img .img') || {}).style?.backgroundImage?.slice(0, 60),
    };
  });
  console.log('  最后一张卡:', JSON.stringify(sample));
  ok('新卡片字段完整', !!(sample.name && sample.price && sample.href), JSON.stringify(sample).slice(0, 80));
  ok('新卡片价格是 -50%', /-50%/.test(sample.price || ''), sample.price);
}

ok('无 JS 异常', errs.length === 0, errs[0] || '');

await browser.close();
const failed = results.filter((r) => !r.p);
console.log(`\n=== ${results.length - failed.length}/${results.length} passed ===`);
if (failed.length) { failed.forEach((f) => console.log('  ✗ ' + f.n)); process.exitCode = 1; }
