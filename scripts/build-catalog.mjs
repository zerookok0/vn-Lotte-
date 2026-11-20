/* [ltm-clone] LOTTE Mart Vietnam — storefront clone (sandbox fixture)
 * visual reference: https://www.lottemart.vn/ (snapshot 2026-11-20)
 * for internal testing / demo use only — not affiliated with LOTTE Mart
 */
/**
 * 从抓到的 API 数据生成本地 catalog（商品 / 分类 / 首页专区）。
 *   node scripts/build-catalog.mjs
 * 输出：public/data/catalog.json
 */
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('.');
const RAW = path.join(ROOT, 'data', 'raw');

const toLocal = (u) => {
  if (!u) return '';
  return String(u)
    .replace(/^https?:\/\/www\.lottemart\.vn/, '')
    .replace(/^https?:\/\/cdn\.lottemart\.vn/, '')
    .replace(/^https?:\/\/d22kdy32c9kdzg\.cloudfront\.net/, '');
};

const homepage = JSON.parse(await readFile(path.join(RAW, 'homepage.json'), 'utf8'));
const categoriesRaw = JSON.parse(await readFile(path.join(RAW, 'categories.json'), 'utf8'));
const bannersRaw = JSON.parse(await readFile(path.join(RAW, 'banners.json'), 'utf8')).data || [];

/* 首页主 banner：桌面图 ↔ 手机图 一一对应（手机端要换成 app_image，否则首图被裁） */
const banners = bannersRaw.map((b) => ({
  id: b.banner_id,
  title: b.title || b.banner_title || '',
  web: toLocal(b.image?.image_web || ''),
  mobile: toLocal(b.app_image || b.image?.image_web || ''),
  link: toLocal(b.link_url || b.image?.link_url || ''),
  type: b.image?.type_banner || '',
  zone: b.type_zone || '',
}));

/* ---------------- 商品 ---------------- */
const products = new Map();

function collectZone(zone, parentKey) {
  const zoneKey = zone.zone || parentKey || '';
  for (const it of zone.items || []) {
    if (!it || !it.sku) continue;
    const p = it.price?.VND || {};
    const ca = it.custom_attribute || {};
    const existing = products.get(String(it.sku));
    const rec = {
      sku: String(it.sku),
      id: it.id,
      name: it.name,
      url_key: it.url_key,
      url: toLocal(it.url) || `/vi-nsg/product/${it.url_key}-${it.sku}-p${it.id}`,
      price: Number(p.price ?? p.default ?? 0),
      price_formatted: p.price_formated || p.default_formated || '',
      special_price: Number(p.special_price ?? 0),
      special_price_formatted: p.special_price_formated && p.special_price ? p.special_price_formated : '',
      image: toLocal(it.image_url),
      thumb: toLocal(it.thumbnail_url),
      image_big: toLocal(it.media_gallery?.big?.['0'] || it.image_url),
      stock_qty: it.stock_qty ?? 0,
      in_stock: it.in_stock ?? 1,
      unit: ca.unit || '',
      weight: ca.weight || '',
      vendor: ca.vendor || '',
      usage_notes: ca.usage_notes || '',
      category_ids: it.category_ids || [],
      zones: [...new Set([...(existing?.zones || []), zoneKey])].filter(Boolean),
    };
    products.set(rec.sku, rec);
  }
  for (const nested of zone.zones || []) collectZone(nested, zoneKey);
}

for (const zone of homepage.data) collectZone(zone, null);

/* ---------------- 分类页 API 补充（按分类拿到更多商品 + 图） ---------------- */
const catDir = path.join(RAW, 'category-api');
const catFiles = await readdir(catDir).catch(() => []);
const byCategory = {};

for (const f of catFiles) {
  let j;
  try { j = JSON.parse(await readFile(path.join(catDir, f), 'utf8')); } catch { continue; }
  const items = j?.data?.items;
  if (!Array.isArray(items) || !items.length) continue;
  const catId = String(j.data.category?.id ?? '');
  if (catId) byCategory[catId] = [];

  for (const it of items) {
    if (!it || !it.sku) continue;
    const p = it.price?.VND || {};
    const ca = it.custom_attribute || {};
    const sku = String(it.sku);
    const existing = products.get(sku);
    const price = Number(p.price ?? p.default ?? 0);
    const special = Number(p.special_price ?? 0);

    let image = toLocal(it.image_url);
    if (!image) {
      // 分类 API 不给 image_url 时按 Magento 缓存路径推导
      const a = sku.slice(0, 1);
      const b = sku.slice(1, 2);
      image = `/media/catalog/product/cache/300x300/${a}/${b}/${sku}-1.jpg.webp`;
    }

    const rec = {
      sku,
      id: it.id ?? existing?.id,
      name: it.name || existing?.name,
      url_key: it.url_key || existing?.url_key,
      url: existing?.url || `/vi-nsg/product/${it.url_key}-${sku}-p${it.id}`,
      price: price || existing?.price || 0,
      price_formatted: p.price_formated || p.default_formated || existing?.price_formatted || '',
      special_price: special,
      special_price_formatted: special ? (p.special_price_formated || '') : '',
      image,
      thumb: image.replace('/300x300/', '/200x200/'),
      image_big: image.replace('/300x300/', '/0x0/'),
      stock_qty: it.stock_qty ?? existing?.stock_qty ?? 0,
      in_stock: it.in_stock ?? 1,
      unit: ca.unit || existing?.unit || '',
      weight: ca.weight || existing?.weight || '',
      vendor: ca.vendor || existing?.vendor || '',
      usage_notes: ca.usage_notes || existing?.usage_notes || '',
      category_ids: it.category_ids || existing?.category_ids || [],
      zones: existing?.zones || ['category'],
      label_image: toLocal(it.label?.[0]?.product_image || it.label?.[0]?.category_image || ''),
    };
    products.set(sku, rec);
    if (catId) byCategory[catId].push(sku);
  }
}

/* ---------------- 分类 ---------------- */
const flat = [];
function walk(node, parentPath) {
  const name = node.name || node.category_name;
  if (!name) return;
  const slug = node.url_key || '';
  const id = String(node.id);
  const url = toLocal(node.url) || `/vi-nsg/category/${slug}-c${id}`;
  const rec = {
    id,
    name,
    url_key: slug,
    url,
    path_formatted: node.path_formatted || '',
    level: node.level ?? 0,
    parent_id: node.parent_id ?? null,
    image: toLocal(node.image || node.category_image || ''),
    meta_description: node.meta_description || '',
    children: [],
  };
  flat.push(rec);
  for (const c of node.child || []) {
    const child = walk(c, rec);
    if (child) rec.children.push(child);
  }
  return rec;
}

const tree = [];
for (const node of categoriesRaw.data || []) {
  const r = walk(node, null);
  if (r) tree.push(r);
}

/* ---------------- 首页专区 ---------------- */
const zones = homepage.data.map((z) => ({
  zone: z.zone || '',
  title_name: z.title_name || '',
  title_image: toLocal(z.title_image || ''),
  banners: (z.banners || []).map((b) => ({
    title: b.title || b.banner_title || '',
    image: toLocal(b.image?.image_web || b.app_image || ''),
    link: toLocal(b.image?.link_url || b.link_url || ''),
    type: b.image?.type_banner || 'static_page',
  })),
  product_skus: (z.items || []).map((i) => String(i.sku)).filter(Boolean),
}));

const catalog = {
  built_at: new Date().toISOString(),
  currency: 'VND',
  locale: 'vi',
  counts: { products: products.size, categories: flat.length, zones: zones.length },
  products: [...products.values()],
  categories: tree,
  categoriesFlat: flat.map(({ children, ...rest }) => rest),
  byCategory,
  banners,
  zones,
};

await mkdir(path.join(ROOT, 'public', 'data'), { recursive: true });
await writeFile(path.join(ROOT, 'public', 'data', 'catalog.json'), JSON.stringify(catalog), 'utf8');

console.log(`products=${catalog.counts.products} categories=${catalog.counts.categories} zones=${catalog.counts.zones}`);
console.log('-> public/data/catalog.json');
console.log('\nsample product:', JSON.stringify(catalog.products[0], null, 2).slice(0, 700));
console.log('\nsample category:', JSON.stringify(catalog.categoriesFlat[0], null, 2));
