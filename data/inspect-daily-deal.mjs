import { readFile } from 'node:fs/promises';

const h = await readFile('public/index.html', 'utf8');

// 找「DAILY DEAL」那一排卡片（截图里的 4 张：ST25 / 三文鱼 / ENVY / 扎肉）
const needles = ['GẠO HOA LÚA', 'CÁ HỒI', 'TÁO ENVY', 'CHẢ LỤA', '126.900', '54.900', '159.000', '74.900'];

for (const n of needles) {
  const i = h.indexOf(n);
  console.log(`${n.padEnd(14)} -> idx ${i}`);
}

const i = h.indexOf('126.900');
if (i > -1) {
  console.log('\n=== around 126.900 (1200 chars) ===');
  console.log(h.slice(Math.max(0, i - 900), i + 400).replace(/></g, '>\n<'));
}

// 统计首页里所有 banner 类卡片的 href
const hrefs = [...h.matchAll(/<a[^>]*href="([^"]+)"[^>]*>\s*<img[^>]*src="([^"]+)"[^>]*>/g)]
  .filter((m) => /banner|ecatalog|home_popup|deal/i.test(m[2]))
  .map((m) => ({ href: m[1], img: m[2].slice(-50) }));
console.log(`\n=== banner 类 <a><img> 组合: ${hrefs.length} ===`);
hrefs.slice(0, 12).forEach((x) => console.log(`  ${x.href.padEnd(52)} ${x.img}`));
