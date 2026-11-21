/**
 * 顶部导航按原站真实目标重映射
 *   node scripts/fix-top-nav-real.mjs [--dry]
 *
 * 原站实测（逐个点击得出）：
 *   Giao 60 PHÚT     → /vi-nsg/tp3/giao-hang-sieu-toc
 *   Đi Chợ Tại Nhà   → /vi-nsg/tp3/fresh-food?isGNB=true
 *   Ưu Đãi Hot       → /vi-nsg/e-catalogue
 *   Khuyến Mãi       → /vi-nsg/promotion
 *   Bán Chạy         → /vi-nsg/best
 *   Hàng Mới         → /vi-nsg/new-arrival
 *   Sự Kiện Nổi Bật  → /vi-nsg/event
 *   Đặt Hàng Nhanh   → /login?callbackUrl=/vi-nsg/quick-order
 *   Trang chủ        → /
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('.');
const DIRS = ['public', 'build/r2-site'];
const dry = process.argv.includes('--dry');

const NAV = {
  'Trang chủ': '/',
  'Giao 60 PHÚT': '/vi-nsg/tp3/giao-hang-sieu-toc',
  'Đi Chợ Tại Nhà': '/vi-nsg/tp3/fresh-food?isGNB=true',
  'Ưu Đãi Hot': '/vi-nsg/e-catalogue',
  'Khuyến Mãi': '/vi-nsg/promotion',
  'Bán Chạy': '/vi-nsg/best',
  'Hàng Mới': '/vi-nsg/new-arrival',
  'Sự Kiện Nổi Bật': '/vi-nsg/event',
  'Đặt Hàng Nhanh': '/login?callbackUrl=/vi-nsg/quick-order',
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
  for (const file of await walk(path.join(ROOT, base))) {
    const src = await readFile(file, 'utf8');
    if (!src.includes('nav-content')) continue;
    let n = 0;
    let out = src;

    for (const [title, url] of Object.entries(NAV)) {
      const esc = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      /* 匹配任意 href（# 或之前映射错的），只换目标 */
      const re = new RegExp(`<a href="[^"]*" title="${esc}" class="d-flex align-items-center">`, 'g');
      out = out.replace(re, () => {
        n++;
        counts[title] = (counts[title] || 0) + 1;
        return `<a href="${url}" title="${title}" class="d-flex align-items-center">`;
      });
    }

    if (n > 0) { touched++; fixed += n; if (!dry) await writeFile(file, out, 'utf8'); }
  }
}

console.log(`files=${touched} links=${fixed}${dry ? '  [dry]' : ''}`);
Object.entries(counts).forEach(([k, v]) => console.log(`  ${k.padEnd(18)} → ${NAV[k].padEnd(44)} ${v}`));
