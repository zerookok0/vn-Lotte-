import { readFile } from 'node:fs/promises';

const h = await readFile('public/index.html', 'utf8');

const count = (s) => h.split(s).length - 1;
for (const pat of ['href="/vi-nsg#"', 'href="#"', 'product-banner-dynamic-text', 'prd-name', 'daily', 'deal']) {
  console.log(String(pat).padEnd(34), count(pat));
}

const i = h.indexOf('product-banner-dynamic-text');
console.log('\n=== product-banner-dynamic-text 结构 ===');
if (i > -1) console.log(h.slice(Math.max(0, i - 100), i + 700).replace(/></g, '>\n<'));

/* 找所有 <a ... href="/vi-nsg#"> 或 href="#"，打印它们的 title 属性 */
const re = /<a\b([^>]*)>/g;
let m;
const list = [];
while ((m = re.exec(h))) {
  const attrs = m[1];
  const href = (attrs.match(/href="([^"]*)"/) || [])[1];
  if (href === '/vi-nsg#' || href === '#' || href === '') {
    const title = (attrs.match(/title="([^"]*)"/) || [])[1] || '';
    list.push({ href, title: title.slice(0, 50) });
  }
}
console.log(`\n=== 占位链接 <a>: ${list.length} ===`);
list.slice(0, 15).forEach((x) => console.log(`  href=${x.href.padEnd(12)} title=${x.title}`));
