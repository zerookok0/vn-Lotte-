import { readFile } from 'node:fs/promises';

const h = await readFile('build/r2-site/vi-nsg/tp3/gia-vi-nau-an.html', 'utf8');

/* 提取 #tp3Menu 区块 */
const start = h.indexOf('id="tp3Menu"');
console.log('=== #tp3Menu 区块（前 2600 字符）===');
if (start > -1) {
  console.log(h.slice(start, start + 2600).replace(/></g, '>\n<'));
} else {
  console.log('未找到 #tp3Menu');
}

/* tab 区：找 "Tất cả sản phẩm" */
const tabStart = h.indexOf('Tất cả sản phẩm');
console.log('\n\n=== tab 区（Tất cả sản phẩm 前后）===');
if (tabStart > -1) {
  console.log(h.slice(Math.max(0, tabStart - 900), tabStart + 500).replace(/></g, '>\n<'));
} else {
  console.log('未找到 "Tất cả sản phẩm"');
}
