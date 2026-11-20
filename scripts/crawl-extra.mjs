/**
 * 补抓「能抓的」额外页面：静态内容页 + 专题落地页。
 *   node scripts/crawl-extra.mjs
 *
 * 来源：
 *   1. 固定清单：about-us / privacy / faq / shipping-delivery / exchange-refund /
 *      account-management / membership-policy
 *   2. 首页 HTML 里出现的所有 /vi-nsg/tp<N>/... 专题链接
 *
 * 输出：public/<path>/index.html（目录形式，静态托管直接命中）
 */
import { chromium } from 'playwright-core';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('.');
const PUBLIC = path.join(ROOT, 'public');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const HOST = 'https://www.lottemart.vn';

const FIXED = [
  '/vi-nsg/about-us',
  '/vi-nsg/privacy',
  '/vi-nsg/faq',
  '/vi-nsg/shipping-delivery',
  '/vi-nsg/exchange-refund',
  '/vi-nsg/account-management',
  '/vi-nsg/membership-policy',
];

/* 专题页：从已生成的首页/分类页 HTML 里扒 */
const extra = new Set();
async function scanHtml(file) {
  let h = '';
  try { h = await readFile(file, 'utf8'); } catch { return; }
  for (const m of h.matchAll(/href="(\/vi-nsg\/tp\d+\/[^"?#]+)"/g)) extra.add(m[1]);
}
await scanHtml(path.join(PUBLIC, 'index.html'));
await scanHtml(path.join(PUBLIC, 'category.html'));
await scanHtml(path.join(PUBLIC, 'product.html'));

const targets = [...new Set([...FIXED, ...extra])];
console.log(`targets: ${targets.length} (static=${FIXED.length}, topic=${extra.size})`);
targets.forEach((t) => console.log('  ' + t));

const HEAD_INJECT = `
  <!-- clone runtime -->
  <link rel="stylesheet" href="/assets/clone.css">
  <link rel="stylesheet" href="/bp/connector.css">
  <script defer src="/bp/connector.js"></script>
  <script defer src="/assets/clone.js"></script>
`;

function clean(html) {
  let out = html;
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  out = out.replace(/<script\b[^>]*\/>/gi, '');
  out = out.replace(/<noscript>[\s\S]*?<\/noscript>/gi, '');
  out = out.replace(/<link[^>]+rel="(?:preconnect|dns-prefetch)"[^>]*>/gi, '');
  out = out.replace(/<link[^>]+rel="(?:prefetch|modulepreload)"[^>]*>/gi, '');
  out = out.replace(/<link[^>]+rel="preload"[^>]+as="script"[^>]*>/gi, '');
  out = out.replace(/<link[^>]+href="[^"]*\/_next\/static\/chunks\/[^"]*"[^>]*>/gi, '');
  out = out.replace(/<div[^>]*class="[^"]*modal-welcome[^"]*"[\s\S]*?<\/div><\/div><\/div><\/div>/gi, '');
  out = out.replace(/<div[^>]*class="fade modal-backdrop show"[^>]*>\s*<\/div>/gi, '');
  out = out.replace(/<body([^>]*)>/i, (m, attrs) => {
    const a = attrs
      .replace(/\sclass="([^"]*)"/i, (mm, cls) => ` class="${cls.split(/\s+/).filter((c) => c && c !== 'modal-open').join(' ')}"`)
      .replace(/\sdata-rr-ui-modal-open="[^"]*"/gi, '')
      .replace(/\sstyle="[^"]*overflow:\s*hidden[^"]*"/gi, '');
    return `<body${a}>`;
  });
  out = out.replaceAll(HOST + '/', '/');
  out = out.replaceAll(HOST, '');
  out = out.replaceAll('https://cdn.lottemart.vn/', '/');
  out = out.replaceAll('https://cdn.lottemart.vn', '');
  out = out.replace(/<next-route-announcer>[\s\S]*?<\/next-route-announcer>/gi, '');
  out = out.replace(/url\((&quot;|"|')?undefined(&quot;|"|')?\)/gi, 'none');
  out = out.replace('</head>', `${HEAD_INJECT}</head>`);
  return out;
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'vi-VN',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
});

/* 先选中门店，避免每页弹窗 */
{
  const p = await ctx.newPage();
  await p.goto(HOST + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(2200);
  try {
    await p.locator('div.modal.show button', { hasText: /Nam Sài Gòn|Gò Vấp/ }).first().click({ timeout: 3000 });
    await p.waitForTimeout(400);
  } catch {}
  for (const sel of ['button:has-text("Xác nhận")', 'button:has-text("Đã hiểu")']) {
    try { await p.click(sel, { timeout: 1500 }); await p.waitForTimeout(300); } catch {}
  }
  await p.close();
}

let ok = 0, fail = 0;
const failed = [];

for (const t of targets) {
  const rel = t.replace(/^\//, '');
  const dir = path.join(PUBLIC, rel);
  const file = path.join(dir, 'index.html');
  const st = await stat(file).catch(() => null);
  if (st && st.size > 5000) { console.log(`  skip ${t}`); continue; }

  const page = await ctx.newPage();
  try {
    const res = await page.goto(HOST + t, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1600);
    await page.evaluate(() => {
      const m = document.querySelector('.modal-welcome');
      if (m) m.remove();
      document.querySelectorAll('.modal-backdrop').forEach((b) => b.remove());
      document.body.classList.remove('modal-open');
      document.body.style.overflow = '';
    });
    await page.evaluate(async () => {
      const h = document.body.scrollHeight;
      for (let y = 0; y < h; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(700);

    const html = await page.content();
    await mkdir(dir, { recursive: true });
    await writeFile(file, clean(html), 'utf8');
    console.log(`  ok   ${String(res.status()).padEnd(4)} ${t}  ${(html.length / 1024).toFixed(0)}KB`);
    ok++;
  } catch (e) {
    console.log(`  fail ${t}  ${String(e).slice(0, 60)}`);
    fail++;
    failed.push(t);
  } finally {
    await page.close();
  }
}

await browser.close();
console.log(`\ndone ok=${ok} fail=${fail}`);
if (failed.length) console.log('failed:', failed.join(', '));
