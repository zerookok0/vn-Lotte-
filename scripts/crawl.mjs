/* [ltm-clone] LOTTE Mart Vietnam — storefront clone (sandbox fixture)
 * visual reference: https://www.lottemart.vn/ (snapshot 2026-11-20)
 * for internal testing / demo use only — not affiliated with LOTTE Mart
 */
/**
 * 抓取 lottemart.vn 渲染后页面（处理门店弹窗 + cookie 横幅后截图）。
 *   node scripts/crawl.mjs [--shots]
 */
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('.');
const RAW = path.join(ROOT, 'data', 'raw');
const PAGES = path.join(RAW, 'pages');
const SHOTS = path.join(RAW, 'shots');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const TARGETS = [
  { name: 'home', url: 'https://www.lottemart.vn/' },
  { name: 'category-rau-cu', url: 'https://www.lottemart.vn/vi-nsg/category/rau-cu-c3' },
  { name: 'product-butter', url: 'https://www.lottemart.vn/vi-nsg/product/bo-lat-anchor-mieng-200g-9415007055648-p69485' },
  { name: 'cart', url: 'https://www.lottemart.vn/cart' },
  { name: 'checkout', url: 'https://www.lottemart.vn/checkout' },
];

const wantShots = process.argv.includes('--shots');

const collectAssets = () => {
  const out = new Set();
  document.querySelectorAll('img').forEach((i) => {
    if (i.currentSrc) out.add(i.currentSrc);
    if (i.src) out.add(i.src);
    if (i.srcset) i.srcset.split(',').forEach((s) => out.add(s.trim().split(' ')[0]));
  });
  document.querySelectorAll('source').forEach((s) => {
    if (s.srcset) s.srcset.split(',').forEach((x) => out.add(x.trim().split(' ')[0]));
  });
  document.querySelectorAll('link[rel=stylesheet], link[rel=preload]').forEach((l) => out.add(l.href));
  document.querySelectorAll('*').forEach((el) => {
    const bg = getComputedStyle(el).backgroundImage;
    if (bg && bg !== 'none') for (const m of bg.matchAll(/url\(["']?(.*?)["']?\)/g)) out.add(m[1]);
  });
  return [...out].filter((u) => /^https?:/.test(u));
};

async function dismiss(page) {
  // cookie banner
  for (const sel of ['button:has-text("Đã hiểu")', 'button:has-text("Đồng ý")']) {
    try { await page.click(sel, { timeout: 1200 }); await page.waitForTimeout(300); break; } catch {}
  }
  // store picker
  const storeModal = page.locator('div.modal.show').first();
  if (await storeModal.count()) {
    try {
      await page.locator('div.modal.show button', { hasText: /Nam Sài Gòn|Gò Vấp|Phú Thọ/ }).first().click({ timeout: 2000 });
      await page.waitForTimeout(400);
    } catch {}
    for (const sel of ['button:has-text("Xác nhận")', 'button:has-text("Xác Nhận")']) {
      try { await page.click(sel, { timeout: 1500 }); await page.waitForTimeout(600); break; } catch {}
    }
  }
  // 再等一次数据
  try { await page.waitForLoadState('networkidle', { timeout: 12000 }); } catch {}
  await page.waitForTimeout(2000);
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

for (const t of TARGETS) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'vi-VN',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();
  try {
    await page.goto(t.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2200);
    await dismiss(page);

    const html = await page.content();
    const assets = await page.evaluate(collectAssets);
    const info = await page.evaluate(() => ({
      title: document.title,
      url: location.href,
      scrollW: document.documentElement.scrollWidth,
      scrollH: document.documentElement.scrollHeight,
      imgCount: document.querySelectorAll('img').length,
      ls: Object.fromEntries(Object.entries(localStorage).filter(([k]) => /store|cart|mart|ltm/i.test(k))),
      productCards: document.querySelectorAll('[class*="product-item"], [class*="product_item"], [class*="item-product"]').length,
    }));

    await mkdir(PAGES, { recursive: true });
    await writeFile(path.join(PAGES, `${t.name}.html`), html, 'utf8');
    await writeFile(path.join(PAGES, `${t.name}.meta.json`), JSON.stringify({ name: t.name, requested: t.url, ...info, assets }, null, 2), 'utf8');

    if (wantShots) {
      await mkdir(SHOTS, { recursive: true });
      await page.screenshot({ path: path.join(SHOTS, `${t.name}.png`), fullPage: true });
    }

    console.log(`OK  ${t.name.padEnd(18)} ${(html.length / 1024).toFixed(0)}KB  assets=${assets.length} imgs=${info.imgCount} cards=${info.productCards} scrollH=${info.scrollH}`);
  } catch (e) {
    console.log(`ERR ${t.name}: ${String(e).slice(0, 160)}`);
  } finally {
    await ctx.close();
  }
}

await browser.close();
console.log('done');
