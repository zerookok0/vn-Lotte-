import { readFile } from 'node:fs/promises';

const h = await readFile('public/index.html', 'utf8');

const find = (needle, before = 400, after = 600) => {
  const i = h.indexOf(needle);
  if (i === -1) return `(not found: ${needle})`;
  return h.slice(Math.max(0, i - before), i + after).replace(/></g, '>\n<');
};

console.log('=== product card sample ===');
console.log(find('product-item', 200, 3000).slice(0, 3500));

console.log('\n=== add-to-cart button candidates ===');
for (const n of ['btn-add-cart', 'add-to-cart', 'Thêm vào giỏ', 'icon-cart', 'btn-cart', 'addCart']) {
  const c = (h.match(new RegExp(n, 'g')) || []).length;
  console.log(`  ${n}: ${c}`);
}

console.log('\n=== header cart badge ===');
console.log(find('cart-count', 200, 300).slice(0, 800));
