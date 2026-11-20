/* [ltm-clone] LOTTE Mart Vietnam — storefront clone (sandbox fixture)
 * visual reference: https://www.lottemart.vn/ (snapshot 2026-11-20)
 * for internal testing / demo use only — not affiliated with LOTTE Mart
 */
/**
 * 在原站滚动到底触发全部懒加载，建立 productHref -> 图片 URL 的映射，并下载图片。
 *   node scripts/grab-product-images.mjs
 *
 * 产出：
 *   data/raw/home-image-map.json   { "/vi-nsg/product/...": "/media/..." }
 *   public/media/...               图片本体
 */
import { chromium } from 'playwright-core';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('.');
const PUBLIC = path.join(ROOT, 'public');
const RAW = path.join(ROOT, 'data', 'raw');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const HOST = 'https://www.lottemart.vn';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'vi-VN',
  userAgent: UA,
});
const page = await ctx.newPage();

await page.goto(HOST + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(2500);

// 关掉门店弹窗
try {
  await page.locator('div.modal.show button', { hasText: /Nam Sài Gòn|Gò Vấp/ }).first().click({ timeout: 2500 });
  await page.waitForTimeout(400);
} catch {}
for (const sel of ['button:has-text("Xác nhận")', 'button:has-text("Đã hiểu")']) {
  try { await page.click(sel, { timeout: 1500 }); await page.waitForTimeout(400); } catch {}
}

// 慢慢滚到底，让 IntersectionObserver 全部触发
const height = await page.evaluate(() => document.body.scrollHeight);
for (let y = 0; y < height; y += 500) {
  await page.evaluate((yy) => window.scrollTo(0, yy), y);
  await page.waitForTimeout(90);
}
await page.waitForTimeout(2500);
try { await page.waitForLoadState('networkidle', { timeout: 20000 }); } catch {}

const map = await page.evaluate(() => {
  const out = {};
  document.querySelectorAll('a[href*="/vi-nsg/product/"]').forEach((a) => {
    const img = a.querySelector('img');
    const href = a.getAttribute('href');
    if (!img) return;
    const src = img.currentSrc || img.src;
    if (src) out[href] = src;
  });
  return out;
});

// 同时抓所有 img（banner、图标）
const allImgs = await page.evaluate(() => [...document.querySelectorAll('img')].map((i) => i.currentSrc || i.src).filter(Boolean));

await browser.close();

const norm = (u) => u.replace(/^https?:\/\/www\.lottemart\.vn/, '').replace(/^https?:\/\/cdn\.lottemart\.vn/, '');
const normMap = {};
for (const [k, v] of Object.entries(map)) normMap[k] = norm(v);

await writeFile(path.join(RAW, 'home-image-map.json'), JSON.stringify(normMap, null, 2), 'utf8');
console.log(`product image map: ${Object.keys(normMap).length} entries`);

const urls = new Set([...Object.values(normMap), ...allImgs.map(norm)].filter((u) => u.startsWith('/')));
console.log(`unique local image paths: ${urls.size}`);

let ok = 0, skip = 0, fail = 0;
const failed = [];
let i = 0;
const list = [...urls];
await Promise.all(Array.from({ length: 10 }, async () => {
  while (i < list.length) {
    const rel = list[i++];
    const dest = path.join(PUBLIC, decodeURIComponent(rel));
    const st = await stat(dest).catch(() => null);
    if (st && st.size > 0) { skip++; continue; }
    try {
      const res = await fetch(HOST + rel, { headers: { 'user-agent': UA, referer: HOST + '/' } });
      if (!res.ok) { fail++; failed.push(`${res.status} ${rel}`); continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length) { fail++; failed.push('empty ' + rel); continue; }
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, buf);
      ok++;
    } catch (e) { fail++; failed.push(String(e).slice(0, 50) + ' ' + rel); }
  }
}));

console.log(`downloaded=${ok} skipped=${skip} failed=${fail}`);
failed.slice(0, 15).forEach((f) => console.log('  ! ' + f));
