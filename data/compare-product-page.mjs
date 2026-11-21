import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const slug = 'nam-mo-trang-uc-200g-9337441000025-9337441000025-p71479';
const srcPub = path.join('public', 'vi-nsg', 'product', `${slug}.html`);
const srcBuild = path.join('build', 'r2-site', 'vi-nsg', 'product', `${slug}.html`);

for (const [label, f] of [['public（模板版）', srcPub], ['build（真实抓取）', srcBuild]]) {
  const st = await stat(f).catch(() => null);
  if (!st) { console.log(`${label}: 不存在`); continue; }
  const h = await readFile(f, 'utf8');
  console.log(`\n=== ${label}  ${(st.size / 1024).toFixed(0)} KB ===`);
  const checks = {
    '标题': (h.match(/<title>([^<]*)/) || [])[1]?.slice(0, 50),
    '有「Chi Tiết Sản Phẩm」tab': h.includes('Chi Tiết Sản Phẩm'),
    '有评价区（Đánh giá）': h.includes('Đánh giá'),
    '相关商品区块数': (h.match(/field-name/g) || []).length,
    '商品图（300x300）': (h.match(/300x300/g) || []).length,
    '视频/图集缩略图': (h.match(/swiper-gallery-thumb/g) || []).length,
    'HTML 长度': h.length,
  };
  Object.entries(checks).forEach(([k, v]) => console.log(`  ${k.padEnd(22)} ${v}`));
}
