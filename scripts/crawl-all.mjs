/**
 * 全量抓取：为 catalog 里的每个商品 / 每个分类生成真实快照页面。
 *   node scripts/crawl-all.mjs [--limit N] [--only product|category]
 *
 * 输出（目录形式，Cloudflare Pages 直接按路径命中，不需要 _redirects 规则）：
 *   public/vi-nsg/product/<slug>/index.html
 *   public/vi-nsg/category/<slug>/index.html
 *
 * 已存在且体积正常的会跳过，可断点续传。
 */
import { chromium } from 'playwright-core';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('.');
const PUBLIC = path.join(ROOT, 'public');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const HOST = 'https://www.lottemart.vn';

const args = process.argv.slice(2);
const limitArg = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : 0;
const onlyArg = args.includes('--only') ? args[args.indexOf('--only') + 1] : '';

const catalog = JSON.parse(await readFile(path.join(PUBLIC, 'data', 'catalog.json'), 'utf8'));
const bySku = new Map(catalog.products.map((p) => [String(p.sku), p]));

/* ---------- 目标列表 ---------- */
const targets = [];

if (!onlyArg || onlyArg === 'product') {
  for (const p of catalog.products) {
    const slug = String(p.url || '').split('/').pop();
    if (!slug) continue;
    targets.push({ kind: 'product', slug, url: p.url, src: HOST + p.url, sku: p.sku });
  }
}
if (!onlyArg || onlyArg === 'category') {
  for (const c of catalog.categoriesFlat) {
    const slug = String(c.url || '').split('/').pop();
    if (!slug) continue;
    targets.push({ kind: 'category', slug, url: c.url, src: HOST + c.url, id: c.id });
  }
}

const limited = limitArg ? targets.slice(0, limitArg) : targets;
console.log(`targets: ${limited.length} (products=${targets.filter(t=>t.kind==='product').length}, categories=${targets.filter(t=>t.kind==='category').length})`);

/* ---------- 复用首页抓取的清理逻辑 ---------- */
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

  // 首页欢迎弹窗 + 遮罩（静态页里没有关闭逻辑，直接不带）
  out = out.replace(/<div[^>]*class="[^"]*modal-welcome[^"]*"[\s\S]*?<\/div><\/div><\/div><\/div>/gi, '');
  out = out.replace(/<div[^>]*class="fade modal-backdrop show"[^>]*>\s*<\/div>/gi, '');

  out = out.replace(/<body([^>]*)>/i, (m, attrs) => {
    const a = attrs
      .replace(/\sclass="([^"]*)"/i, (mm, cls) => {
        const cleaned = cls.split(/\s+/).filter((c) => c && c !== 'modal-open').join(' ');
        return ` class="${cleaned}"`;
      })
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

  // 商品卡占位图回填
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

  // YouTube iframe → 缩略图外链（CSP frame-src 'self'）
  out = out.replace(
    /<iframe\b[^>]*src="https:\/\/www\.youtube\.com\/embed\/([A-Za-z0-9_-]+)[^"]*"[^>]*>\s*<\/iframe>/gi,
    (m, id) => `<a href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener noreferrer" style="display:block;width:100%;height:100%;background:#000">`
      + `<img src="/media/yt/${id}.jpg" alt="YouTube" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block"></a>`,
  );

  out = out.replace('</head>', `${HEAD_INJECT}</head>`);
  return out;
}

/* ---------- 抓取 ---------- */
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'vi-VN',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
});

/* 先过一次首页：选门店 + 落 cookie，后续页面不再弹 */
{
  const p = await ctx.newPage();
  await p.goto(HOST + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(2500);
  try {
    await p.locator('div.modal.show button', { hasText: /Nam Sài Gòn|Gò Vấp/ }).first().click({ timeout: 3000 });
    await p.waitForTimeout(400);
  } catch {}
  for (const sel of ['button:has-text("Xác nhận")', 'button:has-text("Đã hiểu")']) {
    try { await p.click(sel, { timeout: 1500 }); await p.waitForTimeout(300); } catch {}
  }
  await p.evaluate(() => {
    const m = document.querySelector('.modal-welcome');
    if (m) m.remove();
    document.querySelectorAll('.modal-backdrop').forEach((b) => b.remove());
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
  });
  await p.close();
  console.log('session primed (store selected)');
}

let done = 0, skip = 0, fail = 0;
const failed = [];
const started = Date.now();

async function crawlOne(t) {
  const dir = path.join(PUBLIC, 'vi-nsg', t.kind, t.slug);
  const file = path.join(dir, 'index.html');
  const st = await stat(file).catch(() => null);
  if (st && st.size > 20000) { skip++; return; }

  const page = await ctx.newPage();
  try {
    await page.goto(t.src, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1800);
    // 关掉可能出现的弹窗
    await page.evaluate(() => {
      const m = document.querySelector('.modal-welcome');
      if (m) m.remove();
      document.querySelectorAll('.modal-backdrop').forEach((b) => b.remove());
      document.body.classList.remove('modal-open');
      document.body.style.overflow = '';
    });
    // 滚动触发懒加载
    await page.evaluate(async () => {
      const h = document.body.scrollHeight;
      for (let y = 0; y < h; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 45)); }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(900);

    const html = await page.content();
    await mkdir(dir, { recursive: true });
    await writeFile(file, clean(html), 'utf8');
    done++;
  } catch (e) {
    fail++;
    failed.push(`${t.kind}/${t.slug}: ${String(e).slice(0, 70)}`);
  } finally {
    await page.close();
  }
}

const CONC = 4;
let cursor = 0;
await Promise.all(Array.from({ length: CONC }, async () => {
  while (cursor < limited.length) {
    const t = limited[cursor++];
    await crawlOne(t);
    const n = done + skip + fail;
    if (n % 20 === 0) {
      const el = ((Date.now() - started) / 1000).toFixed(0);
      process.stdout.write(`\r  ${n}/${limited.length}  ok=${done} skip=${skip} fail=${fail}  ${el}s   `);
    }
  }
}));

console.log(`\n\ndone=${done} skip=${skip} fail=${fail}  total=${((Date.now() - started) / 1000).toFixed(0)}s`);
if (failed.length) {
  console.log('failures (first 20):');
  failed.slice(0, 20).forEach((f) => console.log('  ' + f));
}

await browser.close();
