/* [ltm-clone] LOTTE Mart Vietnam — storefront clone (sandbox fixture)
 * visual reference: https://www.lottemart.vn/ (snapshot 2026-11-20)
 * for internal testing / demo use only — not affiliated with LOTTE Mart
 */
/**
 * 抓分类页的商品 API 响应（含 image_url），补进 catalog。
 *   node scripts/grab-category-api.mjs
 *
 * 产出：data/raw/category-api/*.json
 */
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('.');
const OUT = path.join(ROOT, 'data', 'raw', 'category-api');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const TARGETS = [
  { name: 'rau-cu', url: 'https://www.lottemart.vn/vi-nsg/category/rau-cu-c3' },
  { name: 'thit-c266', url: 'https://www.lottemart.vn/vi-nsg/category/thit-c266' },
];

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

for (const t of TARGETS) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN', userAgent: UA });
  const page = await ctx.newPage();
  const saved = [];
  page.on('response', async (res) => {
    const u = res.url();
    if (!/\/v1\/p\/mart\/es\//.test(u)) return;
    if (res.status() !== 200) return;
    try {
      const ct = res.headers()['content-type'] || '';
      if (!ct.includes('json')) return;
      const body = await res.text();
      if (body.length < 100) return;
      const idx = saved.length;
      const file = path.join(OUT, `${t.name}-${idx}.json`);
      await writeFile(file, body, 'utf8');
      saved.push({ file: path.basename(file), url: u.slice(0, 160), size: body.length });
    } catch {}
  });

  await page.goto(t.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);
  try {
    await page.locator('div.modal.show button', { hasText: /Nam Sài Gòn|Gò Vấp/ }).first().click({ timeout: 2500 });
    await page.waitForTimeout(400);
  } catch {}
  for (const sel of ['button:has-text("Xác nhận")', 'button:has-text("Đã hiểu")']) {
    try { await page.click(sel, { timeout: 1500 }); await page.waitForTimeout(300); } catch {}
  }
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); }
  });
  await page.waitForTimeout(3000);
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}

  console.log(`\n=== ${t.name} ===`);
  saved.forEach((s) => console.log(`  ${s.size.toString().padStart(8)}  ${s.file}  ${s.url}`));
  await ctx.close();
}

await browser.close();
