import { readFile } from 'node:fs/promises';

for (const f of ['public/category.html', 'public/index.html', 'public/vi-nsg/product/chanh-khong-hat-500g-8935268200836-p228894.html']) {
  const h = await readFile(f, 'utf8');
  const i = h.indexOf('field-price-old');
  console.log(`\n=== ${f} ===`);
  if (i > -1) console.log(h.slice(Math.max(0, i - 50), i + 330).replace(/></g, '>\n<'));

  const priceDivs = [...h.matchAll(/class="(field-price(?!-)[^"]*)"/g)].length;
  const oldDivs = [...h.matchAll(/class="(field-price-old[^"]*)"/g)].length;
  const disc = [...h.matchAll(/Giảm giá<\/strong>-50%/g)].length;
  const polluted = [...h.matchAll(/field-price-old -old/g)].length;
  console.log(`  field-price=${priceDivs}  field-price-old=${oldDivs}  -50%标签=${disc}  脏class=${polluted}`);
}
