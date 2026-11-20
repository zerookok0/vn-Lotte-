/**
 * 全站资源完整性扫描：每个 HTML 引用的本地资源是否真的存在。
 *   node scripts/check-assets.mjs
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const PUBLIC = path.resolve('public');

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, out);
    else if (e.name.endsWith('.html')) out.push(full);
  }
  return out;
}

const htmlFiles = await walk(PUBLIC);
console.log(`html files: ${htmlFiles.length}`);

const refRe = /(?:src|href)="(\/[^"]+)"/g;
const urlRe = /url\((['"]?)(\/[^'")]+)\1\)/g;

const refsByFile = new Map();
const allRefs = new Set();

for (const f of htmlFiles) {
  const html = await readFile(f, 'utf8');
  const set = new Set();
  for (const m of html.matchAll(refRe)) set.add(m[1]);
  for (const m of html.matchAll(urlRe)) set.add(m[2]);
  refsByFile.set(f, set);
  for (const r of set) allRefs.add(r);
}

console.log(`unique local refs: ${allRefs.size}`);

/* 只看资源类路径 */
const assets = [...allRefs].filter((r) => /^\/(asset|media|_next|data|bp|assets)\//.test(r) && !/\?/.test(r));
console.log(`asset-ish refs: ${assets.length}`);

const missing = [];
let exists = 0;
for (const rel of assets) {
  const p = path.join(PUBLIC, decodeURIComponent(rel));
  const st = await stat(p).catch(() => null);
  if (st && st.size > 0) exists++;
  else missing.push(rel);
}

console.log(`present=${exists} missing=${missing.length}`);

if (missing.length) {
  console.log('\n缺失资源：');
  for (const m of missing.slice(0, 40)) {
    // 找引用它的页面
    const pages = [];
    for (const [f, set] of refsByFile) if (set.has(m)) pages.push(path.relative(PUBLIC, f));
    console.log(`  ${m}\n      引用页: ${pages.slice(0, 3).join(', ')}${pages.length > 3 ? ` …(+${pages.length - 3})` : ''}`);
  }
  if (missing.length > 40) console.log(`  … 还有 ${missing.length - 40} 个`);
}

/* 按页面统计坏图数量，找问题最集中的页面 */
const perPage = [];
for (const [f, set] of refsByFile) {
  let bad = 0;
  for (const r of set) if (missing.includes(r)) bad++;
  if (bad) perPage.push({ page: path.relative(PUBLIC, f), bad });
}
perPage.sort((a, b) => b.bad - a.bad);
if (perPage.length) {
  console.log(`\n受影响页面: ${perPage.length}`);
  perPage.slice(0, 12).forEach((p) => console.log(`  ${String(p.bad).padStart(3)} 个坏引用  ${p.page}`));
}
