import { readFile } from 'node:fs/promises';

for (const f of ['public/index.html', 'public/vi-nsg/category/rau-cu-c3.html', 'public/vi-nsg/product/chanh-khong-hat-500g-8935268200836-p228894.html']) {
  const h = await readFile(f, 'utf8');
  console.log(`\n=== ${f} ===`);
  const i = h.indexOf('field-price');
  if (i > -1) console.log(h.slice(Math.max(0, i - 260), i + 320).replace(/\s+/g, ' '));
  const counts = {
    'field-price': (h.match(/class="[^"]*field-price[^"]*"/g) || []).length,
    'field-price-old': (h.match(/class="[^"]*field-price-old[^"]*"/g) || []).length,
  };
  console.log('counts:', JSON.stringify(counts));
}
