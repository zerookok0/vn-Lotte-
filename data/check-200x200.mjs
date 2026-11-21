import { readdir, stat, readFile } from 'node:fs/promises';
import path from 'node:path';

const PUBLIC = path.resolve('public');
const CACHE = path.join(PUBLIC, 'media', 'catalog', 'product', 'cache');

console.log('=== media/catalog/product/cache 下的尺寸目录 ===');
const sizes = await readdir(CACHE).catch(() => []);
for (const s of sizes) {
  const dir = path.join(CACHE, s);
  let count = 0, bytes = 0;
  async function walk(d) {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) await walk(f);
      else { count++; bytes += (await stat(f)).size; }
    }
  }
  await walk(dir);
  console.log(`  ${s.padEnd(10)} ${String(count).padStart(6)} 个  ${(bytes / 1024 / 1024).toFixed(1).padStart(8)} MB`);
}

/* 哪些 HTML 引用了 200x200 */
async function walkHtml(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) await walkHtml(f, out);
    else if (e.name.endsWith('.html')) out.push(f);
  }
  return out;
}

const files = await walkHtml(PUBLIC);
const refs = { '0x0': 0, '75x75': 0, '200x200': 0, '300x300': 0 };
const pagesBySize = { '200x200': new Set(), '300x300': new Set(), '0x0': new Set() };

for (const f of files) {
  const h = await readFile(f, 'utf8');
  for (const k of Object.keys(refs)) {
    const c = h.split(`/cache/${k}/`).length - 1;
    refs[k] += c;
    if (c > 0 && pagesBySize[k]) pagesBySize[k].add(path.relative(PUBLIC, f));
  }
}

console.log('\n=== HTML 里的引用次数 ===');
for (const [k, v] of Object.entries(refs)) console.log(`  ${k.padEnd(10)} ${String(v).padStart(7)} 次`);

console.log('\n=== 引用 200x200 的页面（前 10）===');
console.log('  页面数:', pagesBySize['200x200'].size);
[...pagesBySize['200x200']].slice(0, 10).forEach((p) => console.log('   ' + p));

/* JSON 数据里的引用 */
for (const jf of ['data/products-full.json', 'data/catalog.json', 'data/search-index.json']) {
  const h = await readFile(path.join(PUBLIC, jf), 'utf8');
  const c = h.split('/200x200/').length - 1;
  console.log(`  ${jf.padEnd(34)} 200x200 引用 ${c} 次`);
}
