/* [ltm-clone] LOTTE Mart Vietnam — storefront clone (sandbox fixture)
 * visual reference: https://www.lottemart.vn/ (snapshot 2026-11-20)
 * for internal testing / demo use only — not affiliated with LOTTE Mart
 */
/**
 * 汇总并下载克隆站需要的静态资源（图片/CSS/字体），保持 URL 路径结构。
 *   node scripts/download-assets.mjs
 *
 * 规则：
 *   - 只下 www.lottemart.vn 域下的资源（第三方分析/像素一律丢弃）
 *   - 跳过 _next/static/chunks/*.js（Next 运行时代码，克隆不加载）
 *   - 保存到 public/<原 path>，于是 HTML 里把 "https://www.lottemart.vn/" 换成 "/" 即可
 */
import { readdir, readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('.');
const PAGES = path.join(ROOT, 'data', 'raw', 'pages');
const PUBLIC = path.join(ROOT, 'public');
const HOST = 'https://www.lottemart.vn';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const urls = new Set();

const cssUrlRe = /url\(\s*(["']?)([^"')]+)\1\s*\)/g;

async function collectFromCss(css, baseUrl) {
  for (const m of css.matchAll(cssUrlRe)) {
    let u = m[2].trim();
    if (!u || u.startsWith('data:') || u.startsWith('#')) continue;
    try { u = new URL(u, baseUrl).href; } catch { continue; }
    if (u.startsWith(HOST)) urls.add(u);
  }
}

const files = (await readdir(PAGES)).filter((f) => f.endsWith('.meta.json'));
for (const f of files) {
  const meta = JSON.parse(await readFile(path.join(PAGES, f), 'utf8'));
  for (const u of meta.assets || []) {
    if (!u.startsWith(HOST)) continue;
    if (/\/_next\/static\/chunks\//.test(u)) continue;
    urls.add(u);
  }
}

// CSS 里的引用也要下（字体 / 图片）
for (const u of [...urls]) {
  if (u.endsWith('.css')) {
    try {
      const css = await (await fetch(u, { headers: { 'user-agent': UA, referer: HOST + '/' } })).text();
      await collectFromCss(css, u);
    } catch {}
  }
}
// 已知的两个 next css（页面 meta 里可能没列全）
for (const c of ['/asset/css/bootstrap.min.css', '/_next/static/css/bfe73692512055e8.css', '/_next/static/css/375a85a193efa97a.css']) {
  const u = HOST + c;
  if (!urls.has(u)) {
    try {
      const css = await (await fetch(u, { headers: { 'user-agent': UA } })).text();
      await collectFromCss(css, u);
      urls.add(u);
    } catch {}
  }
}

const list = [...urls].sort();
console.log(`unique assets: ${list.length}`);

let ok = 0, skip = 0, fail = 0;
const failed = [];

async function download(u) {
  const rel = decodeURIComponent(new URL(u).pathname);
  const dest = path.join(PUBLIC, rel);
  try {
    const st = await stat(dest).catch(() => null);
    if (st && st.size > 0) { skip++; return; }
    const res = await fetch(u, { headers: { 'user-agent': UA, referer: HOST + '/' } });
    if (!res.ok) { fail++; failed.push(`${res.status} ${u}`); return; }
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) { fail++; failed.push(`empty ${u}`); return; }
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, buf);
    ok++;
  } catch (e) {
    fail++;
    failed.push(`${String(e).slice(0, 80)} ${u}`);
  }
}

const CONC = 8;
let i = 0;
await Promise.all(Array.from({ length: CONC }, async () => {
  while (i < list.length) {
    const u = list[i++];
    await download(u);
    if ((ok + skip + fail) % 25 === 0) process.stdout.write('.');
  }
}));

console.log(`\ndownloaded=${ok} skipped=${skip} failed=${fail}`);
if (failed.length) {
  console.log('failures:');
  failed.slice(0, 30).forEach((f) => console.log('  ' + f));
}

await writeFile(path.join(ROOT, 'data', 'raw', 'assets-list.json'), JSON.stringify({ total: list.length, ok, skip, fail, failed, urls: list }, null, 2), 'utf8');
console.log('manifest -> data/raw/assets-list.json');
