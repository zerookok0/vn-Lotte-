/**
 * 生成搜索索引（14749 商品，精简字段），供 /search 使用。
 *   node scripts/build-search-index.mjs
 */
import { readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('.');
const PUBLIC = path.join(ROOT, 'public');
const full = JSON.parse(await readFile(path.join(PUBLIC, 'data', 'products-full.json'), 'utf8'));

// 精简成数组，省掉重复的 key 名
const rows = full.products.map((p) => [
  p.sku,
  p.name,
  p.url,
  p.special_price || p.price,
  p.image,
]);

await writeFile(path.join(PUBLIC, 'data', 'search-index.json'), JSON.stringify(rows), 'utf8');
const st = await stat(path.join(PUBLIC, 'data', 'search-index.json'));
console.log(`search index: ${rows.length} items, ${(st.size / 1024 / 1024).toFixed(2)} MB`);
