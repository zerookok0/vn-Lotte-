import { chromium } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const HOST = 'https://www.lottemart.vn';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 }, locale: 'vi-VN',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
});

const MENUS = ['Trang chủ', 'Giao 60 PHÚT', 'Đi Chợ Tại Nhà', 'Ưu Đãi Hot', 'Khuyến Mãi', 'Bán Chạy', 'Hàng Mới', 'Sự Kiện Nổi Bật', 'Đặt Hàng Nhanh'];

async function freshPage() {
  const p = await ctx.newPage();
  await p.goto(HOST + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(2600);
  try {
    await p.locator('div.modal.show button', { hasText: /Nam Sài Gòn|Gò Vấp/ }).first().click({ timeout: 2500 });
    await p.waitForTimeout(500);
  } catch {}
  // 关掉可能的欢迎弹窗
  for (const sel of ['button:has-text("Đã hiểu")', 'button:has-text("Xác nhận")', '.modal .btn-close']) {
    try { await p.click(sel, { timeout: 1200 }); await p.waitForTimeout(300); } catch {}
  }
  return p;
}

console.log('=== 顶部菜单逐个点击（原站）===');
for (const title of MENUS) {
  const p = await freshPage();
  const before = { url: p.url() };
  try {
    const link = p.locator(`.top-nav a[title="${title}"], #navEl a[title="${title}"]`).first();
    const box = await link.boundingBox().catch(() => null);
    if (!box) { console.log(`  ${title.padEnd(20)} 找不到元素`); await p.close(); continue; }

    await link.click({ timeout: 6000 }).catch(() => {});
    await p.waitForTimeout(2500);

    const after = await p.evaluate(() => ({
      url: location.href,
      path: location.pathname + location.search,
      h1: document.querySelector('h1')?.textContent?.trim().slice(0, 50) || '',
      title: document.title.slice(0, 60),
      activeTab: [...document.querySelectorAll('.top-nav a, #navEl a')]
        .filter((a) => a.closest('li')?.classList.contains('active'))
        .map((a) => a.getAttribute('title')),
      scrollY: window.scrollY,
      sectionId: (() => {
        const el = document.elementFromPoint(window.innerWidth / 2, 200);
        return el ? (el.closest('section,div[id]')?.id || el.className?.toString().slice(0, 40) || '') : '';
      })(),
    }));

    console.log(`  ${title.padEnd(20)} path=${after.path.padEnd(38)} h1=${after.h1.slice(0, 30)}`);
  } catch (e) {
    console.log(`  ${title.padEnd(20)} ERR ${String(e).slice(0, 60)}`);
  } finally {
    await p.close();
  }
}

console.log('\n=== 「Mua Gì Hôm Nay」的 tab ===');
{
  const p = await freshPage();
  const tabs = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('.tab-menu button[title], .swiper-slide button[title]').forEach((b) => {
      const t = b.getAttribute('title');
      if (t && !out.some((x) => x.title === t)) out.push({ title: t, cls: b.className });
    });
    return out.slice(0, 20);
  });
  console.log('  找到 tab:', JSON.stringify(tabs.map((t) => t.title)));

  for (const t of tabs.slice(0, 6)) {
    const beforeCards = await p.evaluate(() => document.querySelectorAll('.field-name').length);
    try {
      await p.locator(`button[title="${t.title}"]`).first().click({ timeout: 5000 });
      await p.waitForTimeout(2200);
    } catch {}
    const after = await p.evaluate(() => ({
      cards: document.querySelectorAll('.field-name').length,
      names: [...document.querySelectorAll('.field-name')].slice(0, 2).map((e) => e.textContent.trim().slice(0, 30)),
      url: location.pathname,
    }));
    console.log(`  tab ${t.title.padEnd(16)} cards ${beforeCards} -> ${after.cards}  首两个: ${JSON.stringify(after.names)}`);
  }
  await p.close();
}

console.log('\n=== 「Xem tất cả sản phẩm」按钮 ===');
{
  const p = await freshPage();
  const btns = await p.evaluate(() => {
    return [...document.querySelectorAll('a,button')]
      .filter((el) => /Xem tất cả sản phẩm|Xem tất cả/i.test(el.textContent || ''))
      .slice(0, 5)
      .map((el) => ({ tag: el.tagName, text: el.textContent.trim().slice(0, 30), href: el.getAttribute('href') }));
  });
  console.log('  找到:', JSON.stringify(btns));
  if (btns.length) {
    const before = p.url();
    await p.evaluate(() => {
      const el = [...document.querySelectorAll('a,button')].find((x) => /Xem tất cả sản phẩm/i.test(x.textContent || ''));
      if (el) el.click();
    });
    await p.waitForTimeout(2500);
    console.log(`  ${before} -> ${p.url()}`);
  }
  await p.close();
}

await browser.close();
