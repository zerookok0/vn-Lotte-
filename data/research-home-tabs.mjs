import { readFile } from 'node:fs/promises';

const h = await readFile('build/r2-site/index.html', 'utf8');

/* 1. 所有 tab 按钮（button[title]） */
console.log('=== 首页所有 tab 按钮 ===');
const tabs = [...h.matchAll(/<button type="button" title="([^"]*)"[^>]*>([^<]*)<\/button>/g)];
const seen = new Set();
tabs.forEach((m) => {
  if (!seen.has(m[1])) { seen.add(m[1]); console.log(`  ${m[1]}`); }
});
console.log(`  共 ${seen.size} 个`);

/* 2. tab 所在区块（往前找标题） */
const tabIdx = h.indexOf('<button type="button" title="Giao 60 Phút"');
if (tabIdx > -1) {
  const before = h.slice(Math.max(0, tabIdx - 2500), tabIdx);
  console.log('\n=== 「Giao 60 Phút」tab 之前 2500 字符（找区块标题）===');
  const headings = [...before.matchAll(/<h2[^>]*>([\s\S]{0,120}?)<\/h2>|<img[^>]*alt="([^"]*)"[^>]*>/g)];
  headings.slice(-6).forEach((m) => console.log('  标题/图: ' + (m[1] || m[2] || '').replace(/<[^>]+>/g, '').trim().slice(0, 60)));
  console.log('\n  tab 容器结构:');
  const seg = h.slice(Math.max(0, tabIdx - 700), tabIdx + 300);
  console.log(seg.replace(/></g, '>\n<').slice(0, 1200));
}

/* 3. 该区块的商品容器 */
const afterTabs = h.slice(tabIdx, tabIdx + 6000);
const gridMatch = afterTabs.match(/<div class="([^"]*(?:swiper-wrapper|row-cols)[^"]*)"[^>]*>/);
console.log('\n=== tab 之后的商品网格 ===');
console.log('  ' + (gridMatch ? gridMatch[1] : '未找到'));

/* 4. 首页所有「区块标题图片」 */
console.log('\n=== 首页区块 banner（new_landing 图）===');
const banners = [...h.matchAll(/<img[^>]*src="\/media\/new_landing\/cache\/([^"]+)"/g)].map((m) => m[1]);
[...new Set(banners)].slice(0, 20).forEach((b) => console.log('  ' + b));
