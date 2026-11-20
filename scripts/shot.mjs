/* [ltm-clone] LOTTE Mart Vietnam — storefront clone (sandbox fixture)
 * visual reference: https://www.lottemart.vn/ (snapshot 2026-11-20)
 * for internal testing / demo use only — not affiliated with LOTTE Mart
 */
/**
 * 本地克隆站截图（用于和原站对比 1:1）
 *   node scripts/shot.mjs [url] [name] [width]
 */
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('.');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const targets = process.argv[2]
  ? [{ url: process.argv[2], name: process.argv[3] || 'local', width: Number(process.argv[4] || 1440) }]
  : [
      { url: 'http://127.0.0.1:8787/', name: 'local-home', width: 1440 },
      { url: 'http://127.0.0.1:8787/vi-nsg/category/rau-cu-c3', name: 'local-category', width: 1440 },
      { url: 'http://127.0.0.1:8787/vi-nsg/product/bo-lat-anchor-mieng-200g-9415007055648-p69485', name: 'local-product', width: 1440 },
      { url: 'http://127.0.0.1:8787/cart', name: 'local-cart', width: 1440 },
      { url: 'http://127.0.0.1:8787/checkout', name: 'local-checkout', width: 1440 },
    ];

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

for (const t of targets) {
  const ctx = await browser.newContext({ viewport: { width: t.width, height: 900 }, deviceScaleFactor: 1, locale: 'vi-VN' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  page.on('requestfailed', (r) => errors.push(`FAILED ${r.url().slice(0, 120)}`));

  try {
    await page.goto(t.url, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(1200);
    // 触发懒加载
    await page.evaluate(async () => {
      const step = 700;
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(1200);

    const dims = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      scrollH: document.documentElement.scrollHeight,
      imgs: document.querySelectorAll('img').length,
      brokenImgs: [...document.querySelectorAll('img')].filter((i) => i.complete && i.naturalWidth === 0).length,
    }));

    await mkdir(path.join(ROOT, 'data', 'raw', 'shots'), { recursive: true });
    await page.screenshot({ path: path.join(ROOT, 'data', 'raw', 'shots', `${t.name}.png`), fullPage: true });
    console.log(`${t.name.padEnd(18)} ${dims.scrollW}x${dims.scrollH} imgs=${dims.imgs} broken=${dims.brokenImgs} errs=${errors.length}`);
    if (errors.length) errors.slice(0, 5).forEach((e) => console.log('   ! ' + e));
  } catch (e) {
    console.log(`ERR ${t.name}: ${String(e).slice(0, 150)}`);
  } finally {
    await ctx.close();
  }
}

await browser.close();
