/* [ltm-clone] LOTTE Mart Vietnam — storefront clone (sandbox fixture)
 * visual reference: https://www.lottemart.vn/ (snapshot 2026-11-20)
 * for internal testing / demo use only — not affiliated with LOTTE Mart
 */
/**
 * 把抓到的渲染 HTML 清理成可静态托管的克隆页，并用 catalog 回填商品图。
 *   node scripts/build-pages.mjs [page...]
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('.');
const PAGES = path.join(ROOT, 'data', 'raw', 'pages');
const PUBLIC = path.join(ROOT, 'public');

const HOST = 'https://www.lottemart.vn';
const CDN = 'https://cdn.lottemart.vn';

const OUT = {
  home: 'index.html',
  'category-rau-cu': 'category.html',
  'product-butter': 'product.html',
  cart: 'cart.html',
  checkout: 'checkout.html',
};

const HEAD_INJECT = `
  <!-- clone runtime -->
  <link rel="stylesheet" href="/assets/clone.css">
  <link rel="stylesheet" href="/bp/connector.css">
  <script defer src="/bp/connector.js"></script>
  <script defer src="/assets/clone.js"></script>
`;

const catalog = JSON.parse(await readFile(path.join(PUBLIC, 'data', 'catalog.json'), 'utf8'));
const byUrl = new Map();
const bySku = new Map();
for (const p of catalog.products) {
  byUrl.set(p.url, p);
  byUrl.set(p.url.split('?')[0], p);
  if (p.sku) bySku.set(String(p.sku), p);
}
const skuOf = (href) => {
  const m = String(href).match(/-(\d{8,14})-p\d+/);
  return m ? m[1] : null;
};
const lookup = (href) => {
  const direct = byUrl.get(String(href).split('?')[0]);
  if (direct) return direct;
  const sku = skuOf(href);
  return sku ? bySku.get(sku) || null : null;
};

/** 商品卡里 Next Image 在懒加载前是空 span / 空 a，这里直接把图写进去 */
function fillProductImages(html) {
  let filled = 0;
  const imgFor = (href) => {
    const p = lookup(href);
    if (!p) return null;
    return p.image || p.thumb || null;
  };
  const tagDimensions = 'width="300" height="300" loading="lazy" decoding="async"';

  // a) 占位 span -> background-image
  let out = html.replace(
    /(<a\b[^>]*href="(\/vi-nsg\/product\/[^"]+)"[^>]*>\s*<span\b[^>]*style=")([^"]*)("\s*>\s*<\/span>)/g,
    (m, pre, href, style, post) => {
      const img = imgFor(href);
      if (!img) return m;
      filled++;
      const base = style.replace(/background:[^;]*;?/g, '').trim();
      return pre + `${base} background-image:url('${img}'); background-size:cover; background-position:center center; background-repeat:no-repeat;` + post;
    },
  );

  // b) 空 anchor -> 插入 img
  out = out.replace(
    /(<a\b[^>]*(?:title|alt)="([^"]*)"[^>]*href="(\/vi-nsg\/product\/[^"]+)"[^>]*>)(\s*)(<\/a>)/g,
    (m, open, title, href, ws, close) => {
      if (ws.length > 4) return m;
      const img = imgFor(href);
      if (!img) return m;
      filled++;
      return `${open}<img alt="${title.replace(/"/g, '&quot;')}" src="${img}" ${tagDimensions} style="width:100%;height:100%;object-fit:cover;display:block;background:rgb(245,245,245)">${close}`;
    },
  );

  return { out, filled };
}

function clean(html) {
  let out = html;

  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  out = out.replace(/<script\b[^>]*\/>/gi, '');
  out = out.replace(/<noscript>[\s\S]*?<\/noscript>/gi, '');
  out = out.replace(/<link[^>]+rel="(?:preconnect|dns-prefetch)"[^>]*>/gi, '');
  // Next 的 prefetch / preload script（克隆不加载 chunk，留着只会 404 噪音）
  out = out.replace(/<link[^>]+rel="(?:prefetch|modulepreload)"[^>]*>/gi, '');
  out = out.replace(/<link[^>]+rel="preload"[^>]+as="script"[^>]*>/gi, '');
  out = out.replace(/<link[^>]+href="[^"]*\/_next\/static\/chunks\/[^"]*"[^>]*>/gi, '');

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
  out = out.replaceAll(CDN + '/', '/');
  out = out.replaceAll(CDN, '');
  out = out.replace(/<next-route-announcer>[\s\S]*?<\/next-route-announcer>/gi, '');

  // YouTube 内嵌（frame-src 'self' 下必然被拦）：换成缩略图 + 外链，尺寸由外层容器决定
  out = out.replace(
    /<iframe\b[^>]*src="https:\/\/www\.youtube\.com\/embed\/([A-Za-z0-9_-]+)[^"]*"[^>]*>\s*<\/iframe>/gi,
    (m, id, title) => {
      const t = (m.match(/title="([^"]*)"/) || [, 'YouTube'])[1].replace(/"/g, '&quot;');
      return `<a class="clone-yt" href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener noreferrer" title="${t}" style="display:block;width:100%;height:100%;position:relative;overflow:hidden;border-radius:inherit;background:#000">`
        + `<img src="/media/yt/${id}.jpg" alt="${t}" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block">`
        + `<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none">`
        + `<span style="width:54px;height:38px;border-radius:9px;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center">`
        + `<span style="width:0;height:0;border-left:16px solid #fff;border-top:10px solid transparent;border-bottom:10px solid transparent;margin-left:3px"></span>`
        + `</span></span></a>`;
    },
  );

  out = out.replace('</head>', `${HEAD_INJECT}</head>`);

  return out;
}

const want = process.argv.slice(2);
const names = want.length ? want : Object.keys(OUT);

for (const name of names) {
  const raw = await readFile(path.join(PAGES, `${name}.html`), 'utf8');
  const { out: filledHtml, filled } = fillProductImages(raw);
  const html = clean(filledHtml);
  const dest = path.join(PUBLIC, OUT[name] || `${name}.html`);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, html, 'utf8');
  console.log(`${name.padEnd(18)} -> ${path.relative(ROOT, dest).padEnd(18)} ${(html.length / 1024).toFixed(0)}KB  images=${filled}`);
}
