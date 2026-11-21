import { readdir, stat, readFile } from 'node:fs/promises';
import path from 'node:path';

const DIR = path.join('build', 'r2-site', 'vi-nsg', 'product');
const files = (await readdir(DIR)).filter((f) => f.endsWith('.html'));

const small = [];
let total = 0;
for (const f of files) {
  const st = await stat(path.join(DIR, f));
  total++;
  if (st.size < 50000) small.push({ f, kb: Math.round(st.size / 1024) });
}

console.log(`商品页总数: ${total}`);
console.log(`小于 50 KB 的（疑似空壳）: ${small.length}`);
console.log(`  小于 30 KB: ${small.filter((s) => s.kb < 30).length}`);
console.log(`  30-50 KB : ${small.filter((s) => s.kb >= 30).length}`);

if (small.length) {
  console.log('\n样例（前 15 个）：');
  for (const s of small.slice(0, 15)) {
    const h = await readFile(path.join(DIR, s.f), 'utf8');
    const title = (h.match(/<title>([^<]*)/) || [])[1] || '';
    const hasPrice = h.includes('field-price');
    console.log(`  ${String(s.kb).padStart(3)} KB  price=${hasPrice}  ${title.slice(0, 40).padEnd(42)} ${s.f.slice(0, 50)}`);
  }
}

/* 顺便看非商品页里有没有小文件 */
const otherDirs = ['vi-nsg/category'];
for (const d of otherDirs) {
  const p = path.join('build', 'r2-site', d);
  try {
    const fs2 = (await readdir(p)).filter((f) => f.endsWith('.html'));
    const bad = [];
    for (const f of fs2) {
      const st = await stat(path.join(p, f));
      if (st.size < 50000) bad.push({ f, kb: Math.round(st.size / 1024) });
    }
    console.log(`\n${d}: ${fs2.length} 个页面，小于 50KB 的 ${bad.length} 个`);
    bad.slice(0, 5).forEach((b) => console.log(`  ${b.kb} KB  ${b.f}`));
  } catch { }
}
