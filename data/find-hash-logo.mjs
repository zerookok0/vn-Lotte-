import { readFile } from 'node:fs/promises';

const files = [
  'build/r2-site/cart.html',
  'build/r2-site/index.html',
  'build/r2-site/vi-nsg/product/1-9kg-2kg-2164130000007-2164130000007-p1999.html',
];

for (const f of files) {
  const h = await readFile(f, 'utf8');
  console.log(`\n=== ${f.split('/').pop()} ===`);

  const logoRe = /<a\b[^>]*(?:logo|navbar-brand)[^>]*>/gi;
  let m;
  let n = 0;
  while ((m = logoRe.exec(h)) && n < 6) {
    console.log('  ' + m[0].slice(0, 170));
    n++;
  }

  const hashRe = /<a\b[^>]*href="#"[^>]*>/gi;
  let m2;
  let c = 0;
  while ((m2 = hashRe.exec(h)) && c < 40) {
    if (/logo|brand|home|Trang chủ/i.test(m2[0])) console.log(`  [HASH] ${m2[0].slice(0, 170)}`);
    c++;
  }
}
