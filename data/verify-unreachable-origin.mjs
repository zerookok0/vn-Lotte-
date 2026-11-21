import { readFile } from 'node:fs/promises';

const HOST = 'https://www.lottemart.vn';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0';
const FIELDS = ['id', 'sku', 'name', 'price'];

const catIndex = JSON.parse(await readFile('public/data/cat-index.json', 'utf8'));

async function apiPage(catId, page, limit = 50) {
  const res = await fetch(`${HOST}/v1/p/mart/es/vi_nsg/categories/${catId}/products`, {
    method: 'POST',
    headers: {
      accept: 'application/json', 'content-type': 'application/json',
      'user-agent': UA, referer: `${HOST}/vi-nsg/category/x-c${catId}`, origin: HOST,
    },
    body: JSON.stringify({ limit, offset: page, facet_filters: { category_ids: [String(catId)] }, fields: FIELDS }),
  });
  const j = await res.json().catch(() => null);
  const items = Array.isArray(j?.items) ? j.items : Array.isArray(j?.data?.items) ? j.data.items : [];
  return items.map((x) => String(x.sku));
}

/* 抽查几个：商品属于该分类，但 cat-index 里没有 */
const cases = [
  ['8936146441082', '266', 'Nạc Dăm Heo G Kitchen 300G'],
  ['8936034876651', '170', 'Dồi Sụn MEATDeli 300G'],
  ['8938509627157', '186', 'Nui Ống Dài Meizan Gói 200G'],
  ['8936049050978', '607', 'Sốt Teriyaki Otoki 2.25kg'],
  ['8934673301077', '143', 'Sữa Chua Vinamilk Green Farm'],
];

for (const [sku, catId, name] of cases) {
  console.log(`\n=== ${sku}  ${name}  (category ${catId}) ===`);
  const inIndex = (catIndex[catId] || []).includes(sku);
  console.log(`  cat-index 里: ${inIndex ? '有' : '没有'}`);

  /* 用 API 大 limit 拉该分类全部，看是否包含 */
  const all = await apiPage(catId, 1, 500);
  console.log(`  API limit=500 拉回: ${all.length} 个`);
  console.log(`  API 里含该 SKU: ${all.includes(sku) ? '有' : '没有'}`);

  if (!all.includes(sku)) {
    /* 用关键词搜全站，确认原站能搜到 */
    const r = await fetch(`${HOST}/v1/p/mart/es/vi_nsg/products?q=${encodeURIComponent(name)}&limit=5`, {
      headers: { accept: 'application/json', 'user-agent': UA, referer: `${HOST}/vi-nsg` },
    }).catch(() => null);
    console.log(`  原站搜索接口: ${r ? r.status : 'fail'}`);
  }
}
