/**
 * 补抓指定 URL（漏抓的页面）
 *   node scripts/crawl-missing-pages.mjs urls.txt
 * 或直接传路径：
 *   node scripts/crawl-missing-pages.mjs /vi-nsg/promotion /vi-nsg/product/xxx
 */
import { chromium } from 'playwright-core';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('.');
const OUT = path.join(ROOT, 'build', 'r2-site');
const HOST = 'https://www.lottemart.vn';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const full = JSON.parse(await readFile(path.join(ROOT, 'public', 'data', 'products-full.json'), 'utf8'));
const bySku = new Map(full.products.map((p) => [String(p.sku), p]));

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
  if (HEAD_SNIPPET && !/window\.__BP_CART__/.test(out)) {
    out = out.replace(/<head([^>]*)>/i, (m, attrs) => `<head${attrs}>\n${HEAD_SNIPPET}`);
  }
  if (!/\/bp\/connector\.js/.test(out)) {
    out = out.replace('</head>', `${HEAD_INJECT}</head>`);
  }
  return out;
}

const args = process.argv.slice(2);
let targets = args;
if (args.length === 1 && args[0].endsWith('.txt')) {
  targets = (await readFile(args[0], 'utf8')).split('\n').map((s) => s.trim()).filter(Boolean);
}

console.log(`待补抓: ${targets.length}`);

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 }, locale: 'vi-VN',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
});

let ok = 0, fail = 0;

for (const p of targets) {
  const rel = p.replace(/^\/+/, '').replace(/\/$/, '');
  const file = path.join(OUT, rel + '.html');
  await mkdir(path.dirname(file), { recursive: true });

  const page = await ctx.newPage();
  try {
    await page.goto(HOST + p, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2200);
    await page.evaluate(() => {
      const m = document.querySelector('.modal-welcome');
      if (m) m.remove();
      document.querySelectorAll('.modal-backdrop').forEach((b) => b.remove());
      document.body.classList.remove('modal-open');
      document.body.style.overflow = '';
    });
    await page.evaluate(async () => {
      const h = document.body.scrollHeight;
      for (let y = 0; y < h; y += 1200) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 25)); }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(900);
    const html = await page.content();
    const out = clean(html);
    await writeFile(file, out, 'utf8');
    const st = await stat(file);
    console.log(`  OK  ${(st.size / 1024).toFixed(0).padStart(4)} KB  ${rel}.html`);
    ok++;
  } catch (e) {
    console.log(`  FAIL  ${rel}: ${String(e).slice(0, 70)}`);
    fail++;
  } finally {
    await page.close();
  }
}

console.log(`\n完成: ok=${ok} fail=${fail}`);
await browser.close();
