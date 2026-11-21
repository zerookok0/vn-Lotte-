/**
 * 修复顶部导航死链：.top-nav 里 8 个 <a href="#" title="X"> → 真实地址
 *   node scripts/fix-top-nav.mjs [--dry]
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('.');
const DIRS = ['public', 'build/r2-site'];
const dry = process.argv.includes('--dry');

/* 原站这 8 项都是 href="#" + JS 路由（实测点击无反应），按语义给到最接近的真实页面 */
const NAV = {
  'Trang chủ': '/',
  'Giao 60 PHÚT': '/vi-nsg/tp3/giao-hang-sieu-toc',
  'Đi Chợ Tại Nhà': '/vi-nsg/tp3/giao-hang-sieu-toc',
  'Ưu Đãi Hot': '/vi-nsg/promotion',
  'Khuyến Mãi': '/vi-nsg/promotion',
  'Bán Chạy': '/vi-nsg/tp5/sinh-nhat-lotte',
  'Hàng Mới': '/vi-nsg/promotion',
  'Sự Kiện Nổi Bật': '/vi-nsg/tp5/sinh-nhat-lotte',
  'Đặt Hàng Nhanh': '/vi-nsg/tp3/giao-hang-sieu-toc',
};

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) await walk(f, out);
    else if (e.name.endsWith('.html')) out.push(f);
  }
  return out;
}

let touched = 0, fixed = 0;
const counts = {};

for (const base of DIRS) {
  const files = await walk(path.join(ROOT, base));
  for (const file of files) {
    const src = await readFile(file, 'utf8');
    if (!src.includes('class="d-flex align-items-center"')) continue;
    let n = 0;

    let out = src;
    for (const [title, url] of Object.entries(NAV)) {
      const re = new RegExp(`<a href="#" title="${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" class="d-flex align-items-center">`, 'g');
      out = out.replace(re, () => { n++; counts[title] = (counts[title] || 0) + 1; return `<a href="${url}" title="${title}" class="d-flex align-items-center">`; });
    }

    if (n > 0) {
      touched++;
      fixed += n;
      if (!dry) await writeFile(file, out, 'utf8');
    }
  }
}

console.log(`files touched=${touched}  links fixed=${fixed}${dry ? '  [dry]' : ''}`);
Object.entries(counts).forEach(([k, v]) => console.log(`  ${k.padEnd(20)} ${v}`));
