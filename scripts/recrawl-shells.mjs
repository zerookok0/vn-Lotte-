/**
 * 重抓「空壳页」：成品目录里小于 50 KB 的商品页（抓取时没渲染完）。
 *   node scripts/recrawl-shells.mjs [--conc N] [--dry]
 */
import { chromium } from 'playwright-core';
import { readFile, writeFile, readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('.');
const OUT = path.join(ROOT, 'build', 'r2-site');
const PRODUCT_DIR = path.join(OUT, 'vi-nsg', 'product');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const HOST = 'https://www.lottemart.vn';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const CONC = args.includes('--conc') ? Number(args[args.indexOf('--conc') + 1]) : 4;

const full = JSON.parse(await readFile(path.join(ROOT, 'public', 'data', 'products-full.json'), 'utf8'));
const bySku = new Map(full.products.map((p) => [String(p.sku), p]));
const bySlug = new Map(full.products.map((p) => [p.url.split('/').pop(), p]));

/* 找空壳 */
const shells = [];
for (const f of (await readdir(PRODUCT_DIR)).filter((x) => x.endsWith('.html'))) {
  const st = await stat(path.join(PRODUCT_DIR, f));
  if (st.size < 50000) shells.push({ file: f, slug: f.replace(/\.html$/, ''), kb: Math.round(st.size / 1024) });
}
console.log(`空壳页: ${shells.length}`);
if (dry) {
  shells.slice(0, 5).forEach((s) => console.log(`  ${s.kb} KB  ${s.slug.slice(0, 60)}`));
  process.exit(0);
}
if (!shells.length) process.exit(0);

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

/* 先删空壳 */
for (const s of shells) await unlink(path.join(PRODUCT_DIR, s.file)).catch(() => {});

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
}

let ok = 0, fail = 0, stillShell = 0;
const bad = [];
const started = Date.now();
let cursor = 0;

await Promise.all(Array.from({ length: CONC }, async () => {
  while (cursor < shells.length) {
    const s = shells[cursor++];
    const p = bySlug.get(s.slug);
    const page = await ctx.newPage();
    try {
      await page.goto(HOST + (p ? p.url : `/vi-nsg/product/${s.slug}`), { waitUntil: 'domcontentloaded', timeout: 60000 });
      // 等得更久：这类页面含大量图片/描述
      await page.waitForTimeout(2600);
      await page.evaluate(() => {
        const m = document.querySelector('.modal-welcome');
        if (m) m.remove();
        document.querySelectorAll('.modal-backdrop').forEach((b) => b.remove());
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
      });
      await page.evaluate(async () => {
        const h = document.body.scrollHeight;
        for (let y = 0; y < h; y += 1000) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 30)); }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(1200);

      const html = await page.content();
      const out = clean(html);
      await writeFile(path.join(PRODUCT_DIR, `${s.slug}.html`), out, 'utf8');
      if (out.length < 50000) { stillShell++; bad.push(`${s.slug} (${out.length}B)`); }
      else ok++;
    } catch (e) {
      fail++;
      if (bad.length < 20) bad.push(`${s.slug}: ${String(e).slice(0, 50)}`);
    } finally {
      await page.close();
    }
    const n = ok + fail + stillShell;
    if (n % 20 === 0) {
      const el = ((Date.now() - started) / 1000).toFixed(0);
      process.stdout.write(`\r  ${n}/${shells.length}  ok=${ok} fail=${fail} still=${stillShell}  ${el}s   `);
    }
  }
}));

console.log(`\n\n重抓完成: ok=${ok} fail=${fail} 仍空壳=${stillShell}  ${((Date.now() - started) / 1000 / 60).toFixed(1)}min`);
if (bad.length) bad.slice(0, 15).forEach((b) => console.log('  ' + b));

await browser.close();
