/**
 * 抓每个分类的完整商品列表（分页拉到底），供分类页「Xem thêm」续载。
 *   node scripts/crawl-category-products.mjs [--conc N]
 *
 * 输出 data/cat-index.json：
 *   { "<catId>": ["sku1", "sku2", ...],  ... }   // 按原站顺序
 *   { "_meta": { ... } }
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('.');
const HOST = 'https://www.lottemart.vn';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const args = process.argv.slice(2);
const CONC = args.includes('--conc') ? Number(args[args.indexOf('--conc') + 1]) : 6;
const PAGE = 50;
const MAX_PAGES = 40;

const catalog = JSON.parse(await readFile(path.join(ROOT, 'public', 'data', 'catalog.json'), 'utf8'));
const cats = catalog.categoriesFlat || [];
console.log(`categories: ${cats.length}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(catId, offset) {
  const body = JSON.stringify({
    limit: PAGE,
    offset,
    facet_filters: { category_ids: [String(catId)] },
    fields: ['id', 'sku', 'name', 'price', 'url_key', 'image_url', 'in_stock', 'ext_overall_rating', 'ext_overall_review', 'ext_viewed'],
    order: { price_discount_percent: 'desc' },
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (attempt === 2) return null;
      await sleep(400 * (attempt + 1));
    }
  }
  return null;
}

/** 从返回体里取商品数组（结构可能是 {items:[...]} 或 {data:{items}}） */
function itemsOf(j) {
  if (!j) return [];
  if (Array.isArray(j.items)) return j.items;
  if (Array.isArray(j.data?.items)) return j.data.items;
  if (Array.isArray(j.data)) return j.data;
  if (Array.isArray(j.products)) return j.products;
  if (Array.isArray(j.data?.products)) return j.data.products;
  return [];
}

const out = {};
let doneCats = 0, totalPages = 0, empty = 0;
const started = Date.now();

let cursor = 0;
await Promise.all(Array.from({ length: CONC }, async () => {
  while (cursor < cats.length) {
    const c = cats[cursor++];
    const catId = String(c.id);
    const skus = [];
    let offset = 1;   // ⚠️ offset 是「页码」不是「跳过条数」：1=第1页, 2=第2页…

    for (let pg = 0; pg < MAX_PAGES; pg++) {
      const j = await fetchPage(catId, offset);
      const items = itemsOf(j);
      if (!items.length) break;
      for (const it of items) {
        const s = String(it.sku || '');
        if (s && !skus.includes(s)) skus.push(s);
      }
      totalPages++;
      if (items.length < PAGE) break;
      offset += 1;   // 下一页页码
    }

    if (!skus.length) empty++;
    else out[catId] = skus;
    doneCats++;
    if (doneCats % 20 === 0) {
      const el = ((Date.now() - started) / 1000).toFixed(0);
      process.stdout.write(`\r  ${doneCats}/${cats.length} cats  pages=${totalPages}  skus=${Object.values(out).reduce((a, b) => a + b.length, 0)}  ${el}s   `);
    }
  }
}));

const totalSkuRefs = Object.values(out).reduce((a, b) => a + b.length, 0);
const maxCat = Object.entries(out).sort((a, b) => b[1].length - a[1].length)[0];

console.log(`\n\n完成: ${Object.keys(out).length} 个分类有商品，${empty} 个空分类`);
console.log(`总引用 ${totalSkuRefs} 条，最大分类 ${maxCat?.[0]} 有 ${maxCat?.[1].length} 个商品`);
console.log(`请求页数 ${totalPages}，耗时 ${((Date.now() - started) / 1000 / 60).toFixed(1)} 分钟`);

const payload = {
  _meta: {
    builtAt: new Date().toISOString(),
    categories: Object.keys(out).length,
    refs: totalSkuRefs,
    pageSize: PAGE,
  },
  ...out,
};

const dest = path.join(ROOT, 'public', 'data', 'cat-index.json');
await writeFile(dest, JSON.stringify(payload), 'utf8');
const size = (JSON.stringify(payload).length / 1024).toFixed(0);
console.log(`写入 ${dest}  (${size} KB)`);
