import { readFile } from 'node:fs/promises';

const cat = JSON.parse(await readFile('public/data/catalog.json', 'utf8'));
const cats = cat.categoriesFlat || [];
const idx = JSON.parse(await readFile('public/data/cat-index.json', 'utf8'));
const cards = JSON.parse(await readFile('public/data/card-data.json', 'utf8'));

const strip = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

console.log('=== 名称含 "sua" 的分类 + 商品数 ===');
cats.filter((c) => strip(c.name).includes('sua')).forEach((c) => {
  const n = (idx[String(c.id)] || []).length;
  console.log(`  cat ${String(c.id).padEnd(5)} ${c.name.padEnd(26)} ${String(n).padStart(4)} 个商品   ${c.url}`);
});

console.log('\n=== 商品名含 "sua" 的数量 ===');
const su = Object.entries(cards).filter(([, d]) => strip(d.n).includes('sua'));
console.log(`  ${su.length} 个`);
su.slice(0, 12).forEach(([sku, d]) => console.log(`    ${d.n.slice(0, 46)}`));

console.log('\n=== 商品名含 "sua" 且不像红薯/蔬菜的 ===');
const bad = ['khoai', 'rau', 'cai', 'bi ', 'dau hu', 'banh'];
const good = su.filter(([, d]) => !bad.some((b) => strip(d.n).includes(b)));
console.log(`  ${good.length} 个，前 10:`);
good.slice(0, 10).forEach(([sku, d]) => console.log(`    ${d.n.slice(0, 48)}`));

console.log('\n=== cat-index 里商品数最多的 5 个含 sua 的分类 ===');
const ranked = cats.filter((c) => strip(c.name).includes('sua'))
  .map((c) => ({ id: c.id, name: c.name, n: (idx[String(c.id)] || []).length }))
  .sort((a, b) => b.n - a.n).slice(0, 5);
console.log(JSON.stringify(ranked, null, 0));
