/**
 * 补齐 banner 图片（桌面 + 手机两套）并校验映射。
 *   node scripts/fetch-banners.mjs
 */
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('.');
const PUBLIC = path.join(ROOT, 'public');
const HOST = 'https://www.lottemart.vn';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const catalog = JSON.parse(await readFile(path.join(PUBLIC, 'data', 'catalog.json'), 'utf8'));
const urls = new Set();
for (const b of catalog.banners || []) {
  if (b.web) urls.add(b.web.startsWith('/') ? b.web : '/' + b.web);
  if (b.mobile) urls.add(b.mobile.startsWith('/') ? b.mobile : '/' + b.mobile);
}
console.log('banner images:', urls.size);

let ok = 0, skip = 0, fail = 0;
for (const rel of urls) {
  const dest = path.join(PUBLIC, decodeURIComponent(rel));
  const st = await stat(dest).catch(() => null);
  if (st && st.size > 0) { skip++; continue; }
  try {
    const res = await fetch(HOST + rel, { headers: { 'user-agent': UA, referer: HOST + '/' } });
    if (!res.ok) { console.log(`  ✗ ${res.status} ${rel}`); fail++; continue; }
    const buf = Buffer.from(await res.arrayBuffer());
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, buf);
    console.log(`  ✓ ${(buf.length / 1024).toFixed(0)} KB  ${rel}`);
    ok++;
  } catch (e) {
    console.log(`  ✗ ${String(e).slice(0, 60)} ${rel}`);
    fail++;
  }
}
console.log(`downloaded=${ok} skipped=${skip} failed=${fail}`);

console.log('\n映射检查：');
for (const b of catalog.banners || []) {
  const web = await stat(path.join(PUBLIC, (b.web || '').replace(/^\//, ''))).then((s) => s.size).catch(() => 0);
  const mob = await stat(path.join(PUBLIC, (b.mobile || '').replace(/^\//, ''))).then((s) => s.size).catch(() => 0);
  console.log(`  ${web ? '✓' : '✗'} ${String(web).padStart(7)}  ${b.web}`);
  console.log(`  ${mob ? '✓' : '✗'} ${String(mob).padStart(7)}  ${b.mobile}`);
}
