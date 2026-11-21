import { readFile } from 'node:fs/promises';

const BASE = 'https://vn-lotte.mating.workers.dev';
const full = JSON.parse(await readFile('public/data/products-full.json', 'utf8'));

const nameMap = new Map();
for (const p of full.products) {
  const n = String(p.name || '').trim().toLowerCase();
  if (!n) continue;
  if (!nameMap.has(n)) nameMap.set(n, []);
  nameMap.get(n).push(p);
}
const variants = [...nameMap.entries()].filter(([, v]) => v.length > 1);

let pass = 0, fail = 0;
const failures = [];

for (const [name, group] of variants) {
  const sigs = [];
  for (const p of group) {
    const slug = p.url.split('/').pop();
    try {
      const res = await fetch(BASE + p.url, { headers: { accept: 'text/html' } });
      const html = await res.text();
      const price = (html.match(/field-price[\s\S]{0,220}?(\d[\d.]*)\s*₫/) || [])[1] || '';
      sigs.push({
        sku: String(p.sku),
        slug,
        status: res.status,
        price,
        len: html.length,
        hasOwnSku: html.includes(String(p.sku)),      // 页面里必须出现自己的 SKU
        hasTitle: /<title>[^<]+/.test(html),
      });
    } catch (e) {
      sigs.push({ sku: String(p.sku), slug, error: String(e).slice(0, 40) });
    }
  }
  const problems = [];
  for (const s of sigs) {
    if (s.error) problems.push(`${s.sku}: fetch ${s.error}`);
    else {
      if (s.status !== 200) problems.push(`${s.sku}: status ${s.status}`);
      if (!s.price) problems.push(`${s.sku}: 无价格`);
      if (!s.hasOwnSku) problems.push(`${s.sku}: 页面里找不到自己的 SKU`);
    }
  }
  if (sigs[0]?.slug === sigs[1]?.slug) problems.push('两个 SKU 指向同一 slug');
  if (problems.length) { fail++; failures.push({ name, problems, sigs }); }
  else pass++;
}

console.log(`变体组：${pass} 通过 / ${fail} 失败    共 ${variants.length} 组`);
if (failures.length) {
  console.log('\n失败详情：');
  failures.forEach((f) => {
    console.log(`✗ ${f.name.slice(0, 34)}`);
    f.problems.forEach((p) => console.log(`    ${p}`));
  });
}

/* 抽两组展示 */
console.log('\n=== 抽样展示 ===');
for (const [name, group] of variants.slice(0, 2)) {
  console.log(`\n"${name.slice(0, 34)}"`);
  for (const p of group) {
    const res = await fetch(BASE + p.url);
    const html = await res.text();
    const price = (html.match(/field-price[\s\S]{0,220}?(\d[\d.]*)\s*₫/) || [])[1] || '';
    const img = (html.match(/cache\/300x300\/([^"')]+)/) || [])[1] || '';
    console.log(`  sku=${p.sku}  ${res.status}  price=${price}  img=${img.slice(-32)}`);
    console.log(`       url=${p.url.split('/').pop().slice(0, 56)}`);
  }
}
