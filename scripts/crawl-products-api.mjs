/**
 * 全量抓商品数据（不抓 HTML，走原站商品列表 API）。
 *   node scripts/crawl-products-api.mjs
 *
 * 原站分类页的分页是 POST：
 *   POST /v1/p/mart/es/vi_nsg/categories/<id>/products
 *   {"limit":50,"offset":N,"facet_filters":{"category_ids":["<id>"]},"fields":[...]}
 * offset 从 1 开始。
 *
 * 输出：public/data/products-full.json（精简字段，供商品页模板渲染 + 搜索）
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('.');
const PUBLIC = path.join(ROOT, 'public');
const HOST = 'https://www.lottemart.vn';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const FIELDS = ["id","sku","name","label","price","url_key","image_url","in_stock","promotion","stock_qty","type_id",
  "custom_attribute.bundle_type","ext_overall_rating","ext_overall_review","short_description","bundle_options",
  "child_price","child_stock","configurable_options","configurable_children","custom_attribute","ext_viewed"];

const catalog = JSON.parse(await readFile(path.join(PUBLIC, 'data', 'catalog.json'), 'utf8'));
const cats = catalog.categoriesFlat || [];
console.log(`categories: ${cats.length}`);

const toLocal = (u) => String(u || '')
  .replace(/^https?:\/\/www\.lottemart\.vn/, '')
  .replace(/^https?:\/\/cdn\.lottemart\.vn/, '');

const products = new Map();
let requests = 0, pages = 0, failed = 0;

async function fetchPage(catId, offset) {
  const body = JSON.stringify({
    limit: 50,
    offset,
    facet_filters: { category_ids: [String(catId)] },
    fields: FIELDS,
    order: { price_discount_percent: 'desc' },
  });
  const res = await fetch(`${HOST}/v1/p/mart/es/vi_nsg/categories/${catId}/products`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'user-agent': UA,
      referer: `${HOST}/vi-nsg/category/x-c${catId}`,
      origin: HOST,
    },
    body,
  });
  requests++;
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

function pickItem(it, catId) {
  const p = it.price?.VND || {};
  const ca = it.custom_attribute || {};
  const img = toLocal(it.image_url);
  return {
    sku: String(it.sku),
    id: it.id,
    name: it.name || '',
    url_key: it.url_key || '',
    url: `/vi-nsg/product/${it.url_key}-${it.sku}-p${it.id}`,
    price: Number(p.price ?? p.default ?? 0),
    price_formatted: p.price_formated || p.default_formated || '',
    special_price: Number(p.special_price ?? 0),
    special_price_formatted: p.special_price ? (p.special_price_formated || '') : '',
    image: img,
    thumb: img.replace('/300x300/', '/200x200/'),
    image_big: img.replace('/300x300/', '/0x0/'),
    stock_qty: it.stock_qty ?? 0,
    in_stock: it.in_stock ?? 1,
    unit: ca.unit || '',
    weight: ca.weight || '',
    vendor: ca.vendor || '',
    usage_notes: ca.usage_notes || '',
    short_description: String(it.short_description || '').replace(/<[^>]+>/g, '').slice(0, 400),
    rating: it.ext_overall_rating ?? 0,
    reviews: it.ext_overall_review ?? 0,
    category_ids: it.category_ids || [String(catId)],
    cat: String(catId),
  };
}

async function crawlCategory(catId) {
  let offset = 1;
  let total = null;
  while (offset <= 12) {
    let j;
    try { j = await fetchPage(catId, offset); } catch { failed++; break; }
    if (!j || !j.data || !Array.isArray(j.data.items) || !j.data.items.length) break;
    pages++;
    if (total === null) total = j.data.total_items ?? null;

    for (const it of j.data.items) {
      if (!it || !it.sku) continue;
      const rec = pickItem(it, catId);
      if (!products.has(rec.sku)) products.set(rec.sku, rec);
    }
    if (total !== null && offset * 50 >= total) break;
    if (j.data.items.length < 50) break;
    offset++;
  }
}

/* 并发抓分类 */
const CONC = 8;
let cursor = 0;
const started = Date.now();
await Promise.all(Array.from({ length: CONC }, async () => {
  while (cursor < cats.length) {
    const c = cats[cursor++];
    await crawlCategory(c.id);
    if ((cursor % 20) === 0) {
      process.stdout.write(`\r  ${cursor}/${cats.length}  products=${products.size} req=${requests} pages=${pages}  ${((Date.now()-started)/1000).toFixed(0)}s   `);
    }
  }
}));

const list = [...products.values()];
console.log(`\n\nproducts=${list.length} requests=${requests} pages=${pages} failed=${failed}  ${((Date.now()-started)/1000).toFixed(0)}s`);

await writeFile(path.join(PUBLIC, 'data', 'products-full.json'), JSON.stringify({
  built_at: new Date().toISOString(),
  total: list.length,
  products: list,
}), 'utf8');

const st = (await import('node:fs/promises')).stat;
console.log(`-> public/data/products-full.json  ${((await st(path.join(PUBLIC,'data','products-full.json'))).size/1024/1024).toFixed(1)} MB`);

/* 统计 */
const withImg = list.filter((p) => p.image).length;
const inStock = list.filter((p) => p.in_stock).length;
console.log(`有图: ${withImg} | 有货: ${inStock}`);
console.log('示例:', JSON.stringify(list[0], null, 1).slice(0, 500));
