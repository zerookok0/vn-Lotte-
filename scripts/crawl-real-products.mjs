/**
 * 抓取全部 14749 个商品页的真实快照，输出到 build/r2-site/（R2 部署用）。
 *   node scripts/crawl-real-products.mjs [--limit N] [--conc N]
 *
 * 已存在且体积正常的页面会跳过，可断点续传。
 */
import { chromium } from 'playwright-core';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('.');
const OUT = path.join(ROOT, 'build', 'r2-site');
const PRODUCT_DIR = path.join(OUT, 'vi-nsg', 'product');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const HOST = 'https://www.lottemart.vn';

const args = process.argv.slice(2);
const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : 0;
const CONC = args.includes('--conc') ? Number(args[args.indexOf('--conc') + 1]) : 10;

const full = JSON.parse(await readFile(path.join(ROOT, 'public', 'data', 'products-full.json'), 'utf8'));
const bySku = new Map(full.products.map((p) => [String(p.sku), p]));

const targets = full.products
  .filter((p) => p.url && p.sku)
  .map((p) => ({ slug: p.url.split('/').pop(), url: p.url, sku: String(p.sku) }));

const todo = limit ? targets.slice(0, limit) : targets;
console.log(`targets: ${todo.length}`);

/* ---------- head 片段 ---------- */
let HEAD_SNIPPET = '';
try { HEAD_SNIPPET = await readFile(path.join(ROOT, 'build', 'bp-head.html'), 'utf8'); } catch {}

const HEAD_INJECT = `
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

  out = out.replace(
    /(<a\b[^>]*href="(\/vi-nsg\/product\/[^"]+)"[^>]*>\s*<span\b[^>]*style=")([^"]*)("\s*>\s*<\/span>)/g,
    (m, pre, href, style, post) => {
      const sku = (String(href).match(/-(\d{8,14})-p\d+/) || [])[1];
      const p = sku ? bySku.get(sku) : null;
      if (!p || !(p.image || p.thumb)) return m;
      const base = style.replace(/background:[^;]*;?/g, '').trim();
      return pre + `${base} background-image:url('${p.image || p.thumb}'); background-size:cover; background-position:center center; background-repeat:no-repeat;` + post;
    },
  );

  out = out.replace(
    /<iframe\b[^>]*src="https:\/\/www\.youtube\.com\/embed\/([A-Za-z0-9_-]+)[^"]*"[^>]*>\s*<\/iframe>/gi,
    (m, id) => `<a href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener noreferrer" style="display:block;width:100%;height:100%;background:#000">`
      + `<img src="/media/yt/${id}.jpg" alt="YouTube" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block"></a>`,
  );

  if (HEAD_SNIPPET && !/window\.__BP_CART__/.test(out)) {
    out = out.replace(/<head([^>]*)>/i, (m, attrs) => `<head${attrs}>\n${HEAD_SNIPPET}`);
  }
  if (!/\/bp\/connector\.js/.test(out)) {
    out = out.replace('</head>', `${HEAD_INJECT}</head>`);
  }
  return out;
}

/* ---------- 抓取 ---------- */
await mkdir(PRODUCT_DIR, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'vi-VN',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
});

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
  console.log('session primed');
}

let done = 0, skip = 0, fail = 0;
const failed = [];
const started = Date.now();

async function crawlOne(t) {
  const file = path.join(PRODUCT_DIR, `${t.slug}.html`);
  const st = await stat(file).catch(() => null);
  if (st && st.size > 40000) { skip++; return; }

  const page = await ctx.newPage();
  try {
    await page.goto(HOST + t.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(700);
    await page.evaluate(() => {
      const m = document.querySelector('.modal-welcome');
      if (m) m.remove();
      document.querySelectorAll('.modal-backdrop').forEach((b) => b.remove());
      document.body.classList.remove('modal-open');
      document.body.style.overflow = '';
    });
    await page.evaluate(async () => {
      const h = document.body.scrollHeight;
      for (let y = 0; y < h; y += 1400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 20)); }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(350);

    const html = await page.content();
    await writeFile(file, clean(html), 'utf8');
    done++;
  } catch (e) {
    fail++;
    if (failed.length < 30) failed.push(`${t.slug}: ${String(e).slice(0, 60)}`);
  } finally {
    await page.close();
  }
}

let cursor = 0;
await Promise.all(Array.from({ length: CONC }, async () => {
  while (cursor < todo.length) {
    await crawlOne(todo[cursor++]);
    const n = done + skip + fail;
    if (n % 50 === 0) {
      const el = ((Date.now() - started) / 1000).toFixed(0);
      const rate = n / Math.max(1, el);
      const eta = rate > 0 ? ((todo.length - n) / rate / 60).toFixed(0) : '?';
      process.stdout.write(`\r  ${n}/${todo.length}  ok=${done} skip=${skip} fail=${fail}  ${el}s  ETA ${eta}min   `);
    }
  }
}));

console.log(`\n\ndone=${done} skip=${skip} fail=${fail}  ${((Date.now() - started) / 1000 / 60).toFixed(1)}min`);
if (failed.length) {
  console.log('failures (first 30):');
  failed.forEach((f) => console.log('  ' + f));
}

await browser.close();
