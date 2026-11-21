import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const DIR = path.join('build', 'r2-site', 'vi-nsg', 'product');
const full = JSON.parse(await readFile('public/data/products-full.json', 'utf8'));

/* 变体组 */
const nameMap = new Map();
for (const p of full.products) {
  const n = String(p.name || '').trim().toLowerCase();
  if (!n) continue;
  if (!nameMap.has(n)) nameMap.set(n, []);
  nameMap.get(n).push(p);
}
const variants = [...nameMap.entries()].filter(([, v]) => v.length > 1);

let covered = 0, missing = [];
const variantSlugs = [];
for (const [, group] of variants) {
  for (const p of group) {
    const slug = p.url.split('/').pop();
    variantSlugs.push({ slug, sku: p.sku, name: p.name, price: p.price });
    const st = await stat(path.join(DIR, `${slug}.html`)).catch(() => null);
    if (st && st.size > 40000) covered++;
    else missing.push(slug);
  }
}
console.log(`变体商品条目: ${variantSlugs.length}`);
console.log(`已抓成真实快照: ${covered}`);
console.log(`还没抓: ${missing.length}`);
if (missing.length) missing.slice(0, 8).forEach((m) => console.log('  ' + m));

/* 抽查一对同名变体，比较页面差异 */
const pair = variants.find(([, v]) => v.length === 2 && v.every((x) => !missing.includes(x.url.split('/').pop())));
if (pair) {
  const [n, group] = pair;
  console.log(`\n=== 抽查变体对："${n.slice(0, 40)}" ===`);
  for (const p of group) {
    const slug = p.url.split('/').pop();
    const h = await readFile(path.join(DIR, `${slug}.html`), 'utf8');
    const title = (h.match(/<title>([^<]*)/) || [])[1] || '';
    const sizes = (h.match(/\d+\.\d{3}\s?₫/g) || []).slice(0, 3);
    const imgs = (h.match(/cache\/300x300\/[^"')]+/g) || []).slice(0, 2);
    console.log(`  sku=${p.sku}  id=${p.id}`);
    console.log(`    title: ${title.slice(0, 60)}`);
    console.log(`    价格:  ${sizes.join(' / ')}`);
    console.log(`    首图:  ${imgs[0] || '(none)'}`);
    console.log(`    字节:  ${h.length}`);
  }
  const a = await readFile(path.join(DIR, `${group[0].url.split('/').pop()}.html`), 'utf8');
  const b = await readFile(path.join(DIR, `${group[1].url.split('/').pop()}.html`), 'utf8');
  console.log(`  两页是否不同: ${a !== b ? '不同 ✓' : '相同 ✗'}`);
}

/* 规格选择器探测（configurable product） */
console.log('\n=== 规格选择器（super-attribute / configurable）===');
let withOptions = 0, checked = 0;
const { readdir } = await import('node:fs/promises');
const files = (await readdir(DIR)).filter((f) => f.endsWith('.html')).slice(0, 400);
for (const f of files) {
  const h = await readFile(path.join(DIR, f), 'utf8');
  checked++;
  if (/super-attribute|configurable|swatch-attribute|product-options/i.test(h)) withOptions++;
}
console.log(`抽查 ${checked} 个页面，含规格选择器的: ${withOptions}`);
