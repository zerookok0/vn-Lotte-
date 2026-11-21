import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const DIR = path.join('build', 'r2-site', 'vi-nsg', 'product');
const files = (await readdir(DIR)).filter((f) => f.endsWith('.html'));

/* 规格/变体选择器的各种可能标记 */
const PATTERNS = [
  ['super-attribute', /super-attribute/i],
  ['configurable', /configurable/i],
  ['swatch', /swatch/i],
  ['product-options', /product-options/i],
  ['chọn size', /chọn\s*size|kích\s*cỡ|kích thước/i],
  ['màu sắc', /màu\s*sắc/i],
  ['option box', /option-box|attr-box|variant/i],
  ['select 元素', /<select\b/i],
];

const hits = Object.fromEntries(PATTERNS.map(([k]) => [k, 0]));
const samples = {};
let scanned = 0;

for (const f of files) {
  const h = await readFile(path.join(DIR, f), 'utf8');
  scanned++;
  for (const [k, re] of PATTERNS) {
    if (re.test(h)) {
      hits[k]++;
      if (!samples[k]) samples[k] = f;
    }
  }
}

console.log(`扫描页面: ${scanned}`);
console.log('\n=== 命中统计 ===');
for (const [k] of PATTERNS) console.log(`  ${k.padEnd(20)} ${hits[k]}`);
console.log('\n=== 样例 ===');
for (const [k, f] of Object.entries(samples)) console.log(`  ${k.padEnd(20)} ${f}`);
