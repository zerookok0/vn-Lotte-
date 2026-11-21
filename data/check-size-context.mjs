import { readFile } from 'node:fs/promises';
import path from 'node:path';

const DIR = path.join('build', 'r2-site', 'vi-nsg', 'product');
const samples = [
  '1-9kg-2kg-2164130000007-2164130000007-p1999.html',
  '12-color-clay-kiddy-clay-st20012b-200g-kit-8854500000211-8854500000211-p20815.html',
];

for (const f of samples) {
  const h = await readFile(path.join(DIR, f), 'utf8');
  console.log(`\n########## ${f} ##########`);
  for (const kw of ['chọn size', 'Chọn size', 'màu sắc', 'Màu sắc', 'kích cỡ', 'Kích cỡ']) {
    let i = h.indexOf(kw);
    if (i > -1) {
      console.log(`\n--- "${kw}" @${i} ---`);
      console.log(h.slice(Math.max(0, i - 220), i + 220).replace(/\s+/g, ' '));
      break;
    }
  }
}
