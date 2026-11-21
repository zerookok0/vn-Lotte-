import { readFile } from 'node:fs/promises';
import path from 'node:path';

const files = ['build/r2-site/index.html', 'public/index.html'];

for (const f of files) {
  let h;
  try { h = await readFile(f, 'utf8'); } catch { continue; }
  console.log(`\n########## ${f} ##########`);

  /* 1. 搜索框 */
  const s = h.indexOf('Tim kiếm');
  console.log('\n=== 搜索框 ===');
  if (s > -1) console.log(h.slice(Math.max(0, s - 400), s + 500).replace(/></g, '>\n<'));

  /* 2. 分类图标（圆形 8 个） */
  console.log('\n=== 分类图标区 ===');
  const gv = h.indexOf('Gia vị nêm');
  if (gv > -1) console.log(h.slice(Math.max(0, gv - 700), gv + 300).replace(/></g, '>\n<'));
  else console.log('未找到 "Gia vị nêm"');

  /* 3. tab */
  console.log('\n=== tab（Dầu ô liu）===');
  const ol = h.indexOf('Dầu ô liu');
  if (ol > -1) console.log(h.slice(Math.max(0, ol - 600), ol + 300).replace(/></g, '>\n<'));
  else console.log('未找到 "Dầu ô liu"');

  break; // 只看 R2 那份
}
