import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const dir = 'data/raw/category-api';
const all = await readdir(dir);
const withSize = [];
for (const f of all) withSize.push({ f, size: (await stat(path.join(dir, f))).size });
withSize.sort((a, b) => b.size - a.size);

for (const { f, size } of withSize.slice(0, 3)) {
  const raw = await readFile(path.join(dir, f), 'utf8');
  let j;
  try { j = JSON.parse(raw); } catch { console.log(f, 'not json'); continue; }
  console.log(`\n=== ${f} (${size} bytes) ===`);
  console.log('top keys:', Object.keys(j));
  const d = j.data;
  if (d && typeof d === 'object') {
    console.log('data keys:', Object.keys(d).slice(0, 15));
    const arr = d.items || d.products || d.list;
    if (Array.isArray(arr) && arr.length) {
      console.log('array len:', arr.length);
      const it = arr[0];
      console.log('item top keys:', Object.keys(it).slice(0, 30));
      console.log('sample:', JSON.stringify(it, null, 2).slice(0, 1200));
    }
  } else if (Array.isArray(d)) {
    console.log('data is array len:', d.length, 'first keys:', Object.keys(d[0] || {}).slice(0, 20));
  }
}
