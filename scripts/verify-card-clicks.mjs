import { chromium, devices } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.argv[2] || 'https://vn-lotte.mating.workers.dev';

const results = [];
const ok = (n, p, d = '') => { results.push({ n, p }); console.log(`  ${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

for (const [devName, dev] of [['iPhone 12', devices['iPhone 12']], ['Desktop', { viewport: { width: 1440, height: 900 } }]]) {
  console.log(`\n########## ${devName} ##########`);
  const ctx = await browser.newContext({ ...dev, locale: 'vi-VN' });
  const p = await ctx.newPage();

  const PAGES = [
    ['/vi-nsg/category/rau-cu-c3', '分类页'],
    ['/', '首页'],
    ['/vi-nsg/tp5/sinh-nhat-lotte', '专题页'],
  ];

  for (const [path, label] of PAGES) {
    await p.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForTimeout(2400);
    await p.evaluate(() => {
      const o = document.getElementById('promo-overlay');
      if (o) o.remove();
      document.body.style.overflow = '';
    });

    /* 滚到第一个商品卡 */
    await p.evaluate(() => {
      const card = [...document.querySelectorAll('.item')].find((c) => c.querySelector('.field-price') && c.querySelector('.field-img'));
      if (card) window.scrollTo(0, card.getBoundingClientRect().top + window.scrollY - 250);
    });
    await p.waitForTimeout(800);

    const target = await p.evaluate(() => {
      const card = [...document.querySelectorAll('.item')].find((c) => c.querySelector('.field-price') && c.querySelector('.field-img'));
      if (!card) return null;
      const img = card.querySelector('.field-img');
      const r = img.getBoundingClientRect();
      const link = card.querySelector('.field-img a') || card.querySelector('.field-name a');
      return {
        x: Math.round(r.x + r.width / 2),
        y: Math.round(r.y + r.height / 2),
        href: link?.getAttribute('href') || '',
        name: (card.querySelector('.field-name')?.textContent || '').trim().slice(0, 24),
      };
    });

    if (!target) { ok(`[${devName}] ${label} 点商品图跳转`, false, '没找到商品卡'); continue; }

    const before = p.url();
    await Promise.all([
      p.waitForNavigation({ timeout: 8000 }).catch(() => null),
      p.mouse.click(target.x, target.y),
    ]);
    await p.waitForTimeout(1200);
    const after = p.url();
    const jumped = before !== after && /\/vi-nsg\/product\//.test(after);
    ok(`[${devName}] ${label} 点图片能进商品页`, jumped, jumped ? after.split('/').pop().slice(0, 40) : `${target.name} → 仍在 ${new URL(after).pathname}`);
  }

  /* 加购按钮仍可用（不能被刚才的 CSS 弄坏） */
  await p.goto(BASE + '/vi-nsg/category/rau-cu-c3', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(2200);
  await p.evaluate(() => { const o = document.getElementById('promo-overlay'); if (o) o.remove(); });
  await p.evaluate(() => {
    const card = [...document.querySelectorAll('.item')].find((c) => c.querySelector('.field-price') && c.querySelector('.btn-cart'));
    if (card) window.scrollTo(0, card.getBoundingClientRect().top + window.scrollY - 250);
  });
  await p.waitForTimeout(700);

  const cartTest = await p.evaluate(() => {
    const btn = [...document.querySelectorAll('.item .btn-cart')].find((b) => b.getBoundingClientRect().width > 0);
    if (!btn) return { found: false };
    const before = document.querySelector('.clone-badge')?.textContent || '0';
    btn.click();
    return { found: true, before };
  });
  await p.waitForTimeout(1200);
  const afterCart = await p.evaluate(() => ({
    badge: document.querySelector('.clone-badge')?.textContent?.trim() || '',
    count: (window.__BP_CART__?.items || []).length,
  }));
  ok(`[${devName}] 加购按钮仍可用`, cartTest.found && (Number(afterCart.count) > 0 || afterCart.badge !== ''), JSON.stringify(afterCart));

  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.p);
console.log(`\n=== ${results.length - failed.length}/${results.length} passed ===`);
if (failed.length) process.exitCode = 1;
