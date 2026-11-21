import { readFile } from 'node:fs/promises';

const h = await readFile('build/r2-site/index.html', 'utf8');
const i = h.indexOf('<a href="#" title="Trang chủ"');
console.log('位置:', i);
console.log('\n=== 上下文 ===');
console.log(h.slice(Math.max(0, i - 600), i + 700).replace(/></g, '>\n<'));

/* 同类元素还有几个 */
const re = /<a\b[^>]*title="Trang chủ"[^>]*>/g;
let m;
let n = 0;
console.log('\n=== 所有 title="Trang chủ" 的 <a> ===');
while ((m = re.exec(h))) {
  console.log(`  ${n}: ${m[0].slice(0, 160)}`);
  n++;
}
