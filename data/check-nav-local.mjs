import { readFile } from 'node:fs/promises';

const files = [
  ['build/r2-site/index.html', '首页'],
  ['build/r2-site/vi-nsg/category/dau-an-c201.html', '分类页'],
  ['build/r2-site/vi-nsg/product/chanh-khong-hat-500g-8935268200836-p228894.html', '商品页'],
  ['build/r2-site/cart.html', '购物车'],
  ['build/r2-site/checkout.html', '结账'],
];

const NAV_RE = /<a href="([^"]*)" title="([^"]*)" class="d-flex align-items-center">/g;

for (const [f, label] of files) {
  const h = await readFile(f, 'utf8');
  const i = h.indexOf('nav-content');
  const seg = i > -1 ? h.slice(i, i + 3000) : h;
  const rows = [];
  let m;
  NAV_RE.lastIndex = 0;
  while ((m = NAV_RE.exec(seg)) && rows.length < 10) rows.push({ href: m[1], title: m[2] });

  const dead = rows.filter((r) => r.href === '#' || r.href === '' || r.href === 'javascript:void(0)');
  console.log(`\n=== ${label}（${f.split('/').pop()}）===`);
  rows.forEach((r) => console.log(`  ${r.href.padEnd(44)} ${r.title}`));
  console.log(`  顶部导航 ${rows.length} 项，死链 ${dead.length} 个 ${dead.length === 0 ? '✓' : '✗'}`);

  /* 面包屑 Trang chủ */
  const bc = /<a title="Trang chủ" href="([^"]*)"/.exec(h);
  if (bc) console.log(`  面包屑 Trang chủ → ${bc[1]} ${bc[1] === '/' ? '✓' : '✗'}`);
}

/* 统计全站还剩多少 href="#" 的 top-nav */
import { readdir } from 'node:fs/promises';
import path from 'node:path';

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

const all = await walk('build/r2-site');
let withDeadNav = 0;
let withOkNav = 0;
for (const f of all) {
  const h = await readFile(f, 'utf8');
  if (!h.includes('nav-content')) continue;
  const deadHome = /<a href="#" title="Trang chủ"/.test(h);
  if (deadHome) withDeadNav++;
  else if (/<a href="\/" title="Trang chủ"/.test(h)) withOkNav++;
}
console.log(`\n=== 全站 top-nav 统计 ===`);
console.log(`  已修（Trang chủ → /）: ${withOkNav}`);
console.log(`  仍有死链（Trang chủ → #）: ${withDeadNav}`);
