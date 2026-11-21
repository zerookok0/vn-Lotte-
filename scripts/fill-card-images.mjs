/**
 * 把所有页面里「空的商品图占位」按 SKU 用 14749 条商品数据填满。
 *   node scripts/fill-card-images.mjs [--dry]
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const PUBLIC = path.resolve('public');
const dry = process.argv.includes('--dry');

const full = JSON.parse(await readFile(path.join(PUBLIC, 'data', 'products-full.json'), 'utf8'));
const bySku = new Map();
for (const p of full.products) if (p.sku) bySku.set(String(p.sku), p);
console.log(`products indexed: ${bySku.size}`);

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full2 = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full2, out);
    else if (e.name.endsWith('.html')) out.push(full2);
  }
  return out;
}

const files = await walk(PUBLIC);
let touched = 0, filledSpan = 0, insertedImg = 0, noData = 0;

const skuOf = (href) => (String(href).match(/-(\d{8,14})-p\d+/) || [])[1];
const imgOf = (sku) => {
  const p = bySku.get(sku);
  if (!p) return null;
  return p.image || p.thumb || null;
};

for (const file of files) {
  const src = await readFile(file, 'utf8');
  let n = 0;
  let out = src;

  /* (a) 空 span 占位 -> 补 background-image */
  out = out.replace(
    /(<a\b[^>]*href="(\/vi-nsg\/product\/[^"]+)"[^>]*>\s*<span\b[^>]*style=")([^"]*)("\s*>\s*<\/span>)/g,
    (m, pre, href, style, post) => {
      if (/background-image/.test(style)) return m;      // 已经填过
      const sku = skuOf(href);
      const img = sku && imgOf(sku);
      if (!img) { if (sku) noData++; return m; }
      n++; filledSpan++;
      const base = style.replace(/background:[^;]*;?/g, '').trim();
      return pre + `${base} background-image:url('${img}'); background-size:cover; background-position:center center; background-repeat:no-repeat;` + post;
    },
  );

  /* (b) 完全空的 <a>（没有 span） */
  out = out.replace(
    /(<a\b[^>]*(?:title|alt)="([^"]*)"[^>]*href="(\/vi-nsg\/product\/[^"]+)"[^>]*>)(\s*)(<\/a>)/g,
    (m, open, title, href, ws, close) => {
      if (ws.length > 6) return m;
      const sku = skuOf(href);
      const img = sku && imgOf(sku);
      if (!img) return m;
      n++; insertedImg++;
      return `${open}<img alt="${title.replace(/"/g, '&quot;')}" src="${img}" width="300" height="300" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover;display:block;background:rgb(245,245,245)">${close}`;
    },
  );

  if (n > 0) {
    touched++;
    if (!dry) await writeFile(file, out, 'utf8');
  }
}

console.log(`files touched=${touched}/${files.length}`);
console.log(`  span 填图: ${filledSpan}`);
console.log(`  空 a 插 img: ${insertedImg}`);
console.log(`  有链接但无商品数据: ${noData}`);
console.log(dry ? '[dry run]' : 'done');
