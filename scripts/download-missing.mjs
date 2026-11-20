/* [ltm-clone] LOTTE Mart Vietnam — storefront clone (sandbox fixture)
 * visual reference: https://www.lottemart.vn/ (snapshot 2026-11-20)
 * for internal testing / demo use only — not affiliated with LOTTE Mart
 */
/**
 * 补齐克隆站资源：catalog 里的商品图 + 已生成 HTML 里引用到的所有本地路径。
 *   node scripts/download-missing.mjs
 *
 * 只下载 public/ 下还不存在、且属于 lottemart 域的资源。
 */
import { readFile, readdir, mkdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('.');
const PUBLIC = path.join(ROOT, 'public');
const HOST = 'https://www.lottemart.vn';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const wanted = new Set();

/* 1. catalog 商品图 */
const catalog = JSON.parse(await readFile(path.join(PUBLIC, 'data', 'catalog.json'), 'utf8'));
for (const p of catalog.products) {
  for (const k of ['image', 'thumb', 'image_big']) {
    if (p[k] && p[k].startsWith('/')) wanted.add(p[k]);
  }
}
/* 2. HTML 里的本地引用 */
const htmlFiles = (await readdir(PUBLIC)).filter((f) => f.endsWith('.html'));
for (const f of htmlFiles) {
  const html = await readFile(path.join(PUBLIC, f), 'utf8');
  for (const m of html.matchAll(/(?:src|href)="(\/[^"]+)"/g)) wanted.add(m[1]);
  for (const m of html.matchAll(/url\((['"]?)(\/[^'")]+)\1\)/g)) wanted.add(m[2]);
}
/* 3. CSS 里的本地引用 */
async function scanCss(dir) {
  let entries = [];
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { await scanCss(full); continue; }
    if (!e.name.endsWith('.css')) continue;
    const css = await readFile(full, 'utf8');
    for (const m of css.matchAll(/url\((['"]?)(\/[^'")]+)\1\)/g)) wanted.add(m[2]);
  }
}
await scanCss(PUBLIC);

const list = [...wanted].filter((p) => /^\/(asset|media|_next|static)\//.test(p) && !p.endsWith('.js'));
console.log(`candidates: ${list.length}`);

let ok = 0, skip = 0, fail = 0;
const failed = [];

async function download(rel) {
  const dest = path.join(PUBLIC, decodeURIComponent(rel));
  const st = await stat(dest).catch(() => null);
  if (st && st.size > 0) { skip++; return; }
  const url = HOST + rel;
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, referer: HOST + '/' } });
    if (!res.ok) { fail++; failed.push(`${res.status} ${rel}`); return; }
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) { fail++; failed.push(`empty ${rel}`); return; }
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, buf);
    ok++;
  } catch (e) {
    fail++;
    failed.push(`${String(e).slice(0, 60)} ${rel}`);
  }
}

let i = 0;
await Promise.all(Array.from({ length: 10 }, async () => {
  while (i < list.length) {
    await download(list[i++]);
    if ((ok + skip + fail) % 40 === 0) process.stdout.write('.');
  }
}));

console.log(`\ndownloaded=${ok} skipped=${skip} failed=${fail}`);
if (failed.length) {
  console.log('failures (first 20):');
  failed.slice(0, 20).forEach((f) => console.log('  ' + f));
}
