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
  return { status: res.status, count: items.length, total: j?.total ?? j?.data?.total ?? null, sample: items.slice(0, 2).map((x) => x.sku) };
}

/* 挑几个已确认有 50 个的分类，试 offset 51 / 101 */
for (const catId of ['704', '624', '201', '200']) {
  console.log(`\n=== category ${catId} ===`);
  for (const off of [1, 51, 101]) {
    const r = await page(catId, off);
    console.log(`  offset=${String(off).padStart(3)}  status=${r.status}  items=${String(r.count).padStart(2)}  total=${r.total}`);
  }
  // 试大 limit
  const big = await page(catId, 1, 200);
  console.log(`  limit=200 offset=1  items=${big.count}  total=${big.total}`);
}
