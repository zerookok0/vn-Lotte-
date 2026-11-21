import { readFile } from 'node:fs/promises';

const cat = JSON.parse(await readFile('public/data/catalog.json', 'utf8'));
const cats = cat.categoriesFlat || cat.categories;
const products = JSON.parse(await readFile('public/data/products-full.json', 'utf8')).products;

const TABS = ['Giao 60 Phút', 'Thủy sản', 'Gạo', 'Dầu Ăn', 'Sữa', 'Giá Tốt', 'Mưa Quà Tặng',
  'Trà, Cà Phê', 'Mì, Bún, Topokki Ăn Liền', 'Chăm Sóc Nhà Cửa', 'Khăn Tắm, Bông Tắm', 'Nồi, Chảo', 'Dụng Cụ Bếp Khác'];

const strip = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

function findCat(tabName) {
  const t = strip(tabName);
  /* 拆分可能的复合词 */
  const parts = t.split(/[,/]/).map((s) => s.trim()).filter(Boolean);
  const tryList = [t, ...parts];

  for (const q of tryList) {
    if (!q || q.length < 2) continue;
    /* 精确 */
    let hit = cats.find((c) => strip(c.name) === q);
    if (hit) return { cat: hit, how: 'exact' };
    /* 包含（分类名包含查询词） */
    hit = cats.find((c) => strip(c.name).includes(q) && q.length >= 3);
    if (hit) return { cat: hit, how: 'contains' };
    /* 反向包含 */
    hit = cats.find((c) => q.includes(strip(c.name)) && strip(c.name).length >= 3);
    if (hit) return { cat: hit, how: 'reverse' };
  }
  return null;
}

/* vendor 品牌 tab */
const vendors = new Map();
for (const p of products) {
  const v = String(p.vendor || '').trim();
  if (!v) continue;
  vendors.set(v.toLowerCase(), (vendors.get(v.toLowerCase()) || 0) + 1);
}

console.log('=== tab → 数据源 ===');
const out = {};
for (const t of TABS) {
  const r = findCat(t);
  if (r) {
    const n = products.filter((p) => (p.category_ids || []).map(String).includes(String(r.cat.id))).length;
    out[t] = { catId: r.cat.id, url: r.cat.url, name: r.cat.name, how: r.how, products: n };
    console.log(`  ${t.padEnd(26)} → cat ${String(r.cat.id).padEnd(5)} ${r.cat.name.padEnd(28)} (${r.how}, ${n} 个)`);
  } else {
    /* 试 vendor */
    const key = strip(t);
    const vhit = [...vendors.entries()].find(([v]) => v.includes(key) || key.includes(v));
    if (vhit) {
      out[t] = { vendor: vhit[0], products: vhit[1] };
      console.log(`  ${t.padEnd(26)} → vendor "${vhit[0]}" (${vhit[1]} 个)`);
    } else {
      out[t] = null;
      console.log(`  ${t.padEnd(26)} → 未找到`);
    }
  }
}

console.log('\n=== 可用 vendor（前 15）===');
[...vendors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([v, n]) => console.log(`  ${String(n).padStart(5)}  ${v}`));

/* 输出映射表供 clone.js 用 */
console.log('\n=== JSON ===');
console.log(JSON.stringify(out, null, 0));
