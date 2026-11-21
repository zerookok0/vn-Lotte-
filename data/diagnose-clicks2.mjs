import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const DIR = 'build/r2-site/vi-nsg/category';
const files = (await readdir(DIR)).filter((f) => f.endsWith('.html'));

const hits = [];
for (const f of files) {
  const h = await readFile(path.join(DIR, f), 'utf8');
  if (h.includes('Dầu ô liu') && h.includes('Gia vị nêm')) hits.push(f);
}
console.log('同时含「Dầu ô liu」和「Gia vị nêm」的页面:', hits.length);
hits.slice(0, 5).forEach((h) => console.log('  ' + h));

const target = hits[0];
if (!target) process.exit(0);

const h = await readFile(path.join(DIR, target), 'utf8');
console.log(`\n########## ${target}  (${(h.length / 1024).toFixed(0)} KB) ##########`);

/* 1. 搜索框 */
const s = h.indexOf('Tim kiếm');
console.log('\n=== 搜索框 HTML ===');
if (s > -1) console.log(h.slice(Math.max(0, s - 500), s + 420).replace(/></g, '>\n<'));

/* 2. 分类圆形图标 */
const gv = h.indexOf('Gia vị nêm');
console.log('\n=== 分类图标（Gia vị nêm 附近）===');
if (gv > -1) console.log(h.slice(Math.max(0, gv - 900), gv + 200).replace(/></g, '>\n<'));

/* 3. tab */
const ol = h.indexOf('Dầu ô liu');
console.log('\n=== tab（Dầu ô liu 附近）===');
if (ol > -1) console.log(h.slice(Math.max(0, ol - 800), ol + 260).replace(/></g, '>\n<'));
