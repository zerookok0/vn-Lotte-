/**
 * 统计并补齐 products-full 里引用的商品图（只补 300x300，详情页大图复用同文件）。
 *   node scripts/fetch-product-images.mjs [--limit N]
 */
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('.');
const PUBLIC = path.join(ROOT, 'public');
const HOST = 'https://www.lottemart.vn';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const args = process.argv.slice(2);
const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : 0;

const full = JSON.parse(await readFile(path.join(PUBLIC, 'data', 'products-full.json'), 'utf8'));
const urls = new Set();
for (const p of full.products) {
  if (p.image) urls.add(p.image);
}
const list = [...urls];
console.log(`unique product images: ${list.length}`);

/* 先看缺多少 */
const missing = [];
for (const rel of list) {
  const dest = path.join(PUBLIC, decodeURIComponent(rel));
  const st = await stat(dest).catch(() => null);
  if (!st || st.size === 0) missing.push(rel);
}
console.log(`missing locally: ${missing.length}  (present: ${list.length - missing.length})`);

const todo = limit ? missing.slice(0, limit) : missing;
if (!todo.length) { console.log('nothing to download'); process.exit(0); }

let ok = 0, fail = 0;
const failed = [];
let i = 0;
const started = Date.now();

await Promise.all(Array.from({ length: 10 }, async () => {
  while (i < todo.length) {
    const rel = todo[i++];
    const dest = path.join(PUBLIC, decodeURIComponent(rel));
    try {
      const res = await fetch(HOST + rel, { headers: { 'user-agent': UA, referer: HOST + '/' } });
      if (!res.ok) { fail++; failed.push(`${res.status} ${rel}`); continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length) { fail++; continue; }
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, buf);
      ok++;
    } catch (e) { fail++; failed.push(String(e).slice(0, 40)); }
    if ((ok + fail) % 100 === 0) {
      process.stdout.write(`\r  ${ok + fail}/${todo.length}  ok=${ok} fail=${fail}  ${((Date.now() - started) / 1000).toFixed(0)}s   `);
    }
  }
}));

console.log(`\ndownloaded=${ok} failed=${fail}  ${((Date.now() - started) / 1000).toFixed(0)}s`);
if (failed.length) failed.slice(0, 10).forEach((f) => console.log('  ! ' + f));
