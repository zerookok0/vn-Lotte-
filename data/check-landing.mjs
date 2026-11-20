import { stat, readdir } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const target = 'public/media/new_landing/cache/1200_Pet_Care_.jpg.webp';
const st = await stat(target).catch(() => null);
console.log(`${target} -> ${st ? st.size + ' bytes' : 'MISSING'}`);

const dir = 'public/media/new_landing';
console.log(`\n${dir} exists:`, !!await stat(dir).catch(() => null));
const cache = path.join(dir, 'cache');
const list = await readdir(cache).catch(() => null);
console.log(`cache/ entries: ${list ? list.length : 'NO DIR'}`);
if (list) console.log(list.slice(0, 10).join('\n'));

const html = await readFile('public/vi-nsg/tp5/pet-shop.html', 'utf8');
const refs = [...new Set([...html.matchAll(/\/media\/new_landing[^"')\s]+/g)].map((m) => m[0]))];
console.log(`\nHTML refs to new_landing: ${refs.length}`);
refs.slice(0, 8).forEach((r) => console.log('  ' + r));

// 统计这些引用里有多少文件真的存在
let exists = 0, missing = 0;
const missingList = [];
for (const r of refs) {
  const p = path.join('public', decodeURIComponent(r));
  const s = await stat(p).catch(() => null);
  if (s && s.size > 0) exists++;
  else { missing++; if (missingList.length < 8) missingList.push(r); }
}
console.log(`\nrefs present=${exists} missing=${missing}`);
console.log('missing examples:\n  ' + missingList.join('\n  '));
