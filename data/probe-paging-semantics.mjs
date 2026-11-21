const HOST = 'https://www.lottemart.vn';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0';
const FIELDS = ['id', 'sku', 'name', 'price', 'url_key'];

async function page(catId, offset, limit = 50) {
  const res = await fetch(`${HOST}/v1/p/mart/es/vi_nsg/categories/${catId}/products`, {
    method: 'POST',
    headers: {
      accept: 'application/json', 'content-type': 'application/json',
      'user-agent': UA, referer: `${HOST}/vi-nsg/category/x-c${catId}`, origin: HOST,
    },
    body: JSON.stringify({ limit, offset, facet_filters: { category_ids: [String(catId)] }, fields: FIELDS }),
  });
  const j = await res.json().catch(() => null);
  const items = Array.isArray(j?.items) ? j.items : Array.isArray(j?.data?.items) ? j.data.items : [];
  return items.map((x) => String(x.sku));
}

for (const catId of ['201', '200', '704']) {
  console.log(`\n=== category ${catId} ===`);
  const seen = new Set();
  for (let pg = 1; pg <= 6; pg++) {
    const skus = await page(catId, pg);
    const fresh = skus.filter((s) => !seen.has(s));
    skus.forEach((s) => seen.add(s));
    console.log(`  offset=${pg} (页码)  items=${String(skus.length).padStart(2)}  新增=${String(fresh.length).padStart(2)}  累计唯一=${seen.size}`);
    if (!skus.length) break;
  }
  /* 用 limit=200 一次拿全，对比总数 */
  const all = await page(catId, 1, 200);
  const allSet = new Set(all);
  console.log(`  limit=200 一次拿: ${all.length}，唯一 ${allSet.size}`);
  console.log(`  分页累计 ${seen.size}  vs  一次 ${allSet.size}  ->  ${seen.size === allSet.size ? '一致 ✓' : '不一致'}`);
}
