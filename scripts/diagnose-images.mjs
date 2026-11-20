/* [ltm-clone] LOTTE Mart Vietnam — storefront clone (sandbox fixture)
 * visual reference: https://www.lottemart.vn/ (snapshot 2026-11-20)
 * for internal testing / demo use only — not affiliated with LOTTE Mart
 */
/**
 * 诊断克隆页里的空白图片：找出所有商品卡链接与其图片状态。
 *   node scripts/diagnose-images.mjs
 */
import { chromium } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:8787/', { waitUntil: 'networkidle', timeout: 45000 });
await page.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 800) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); }
  window.scrollTo(0, 0);
});
await page.waitForTimeout(1500);

const report = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('a[href*="/vi-nsg/product/"]')];
  const seen = new Set();
  const rows = [];
  for (const a of cards) {
    const href = a.getAttribute('href');
    if (seen.has(href)) continue;
    seen.add(href);
    const holder = a.querySelector('span,img');
    let bg = '', src = '', state = 'none';
    if (holder) {
      if (holder.tagName === 'IMG') {
        src = holder.getAttribute('src') || '';
        state = holder.complete ? (holder.naturalWidth ? 'ok' : 'broken') : 'loading';
      } else {
        bg = getComputedStyle(holder).backgroundImage;
        state = bg && bg !== 'none' ? 'bg' : 'empty';
        src = (bg.match(/url\("?([^")]+)"?\)/) || [])[1] || '';
      }
    }
    rows.push({ href, state, src: src.slice(0, 110), hasHolder: !!holder });
  }
  const empty = rows.filter((r) => r.state === 'empty' || r.state === 'none' || r.state === 'broken');
  return { total: rows.length, ok: rows.length - empty.length, empty: empty.length, samples: empty.slice(0, 25), okSamples: rows.filter(r => r.state === 'bg' || r.state === 'ok').slice(0, 3) };
});

console.log(JSON.stringify(report, null, 2));

// 检查 iframe
const iframes = await page.evaluate(() => [...document.querySelectorAll('iframe')].map((f) => ({ src: f.src, w: f.width, h: f.height, cls: f.className })));
console.log('\niframes:', JSON.stringify(iframes, null, 2));

await browser.close();
