import { readFile } from 'node:fs/promises';

for (const f of ['public/vi-nsg/tp5/sinh-nhat-lotte.html', 'public/index.html']) {
  const h = await readFile(f, 'utf8');
  console.log(`\n########## ${f} ##########`);
  console.log('size:', (h.length / 1024).toFixed(0) + 'KB');
  for (const s of ['product-banner-dynamic-text', 'prd-name', 'href="/vi-nsg#"', 'Xem tất cả sản phẩm', 'DAILY', 'Ưu Đãi']) {
    console.log(' ', String(s).padEnd(30), h.split(s).length - 1);
  }

  // 列出所有 <a ...><img ...> 里的 href
  const re = /<a\b([^>]*)>\s*<img\b([^>]*)>/g;
  let m, n = 0;
  const rows = [];
  while ((m = re.exec(h)) && n < 200) {
    const href = (m[1].match(/href="([^"]*)"/) || [])[1] || '';
    const src = (m[2].match(/src="([^"]*)"/) || [])[1] || '';
    rows.push({ href, src: src.slice(-46) });
    n++;
  }
  console.log(`  <a><img> 组合: ${rows.length}`);
  const suspicious = rows.filter((r) => r.href === '#' || r.href === '' || r.href === '/vi-nsg#');
  console.log(`  其中 href 是占位: ${suspicious.length}`);
  suspicious.slice(0, 8).forEach((r) => console.log(`    ${r.href.padEnd(10)} ${r.src}`));
  if (rows.length) {
    console.log('  前 6 个正常组合:');
    rows.slice(0, 6).forEach((r) => console.log(`    ${r.href.slice(0, 52).padEnd(52)} ${r.src}`));
  }
}
