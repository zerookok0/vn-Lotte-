/**
 * 检查全站「回首页」入口（流式，不占内存）
 *   node data/audit-home-links.mjs [baseUrl]
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const SITE = path.resolve('build/r2-site');

async function walk(dir, rel = '', out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) await walk(full, r, out);
    else if (e.name.endsWith('.html')) out.push({ full, rel: r });
  }
  return out;
}

const files = await walk(SITE);
console.log(`检查 ${files.length} 个页面\n`);

let pagesWithDeadHome = 0;
let deadHomeLinks = 0;
let pagesWithAnyHome = 0;
const samples = [];
const deadByHref = new Map();

for (const f of files) {
  const h = await readFile(f.full, 'utf8');

  // logo / breadcrumb 里的 <a>
  const candidates = [];
  const re = /<a\b([^>]*)>/g;
  let m;
  while ((m = re.exec(h))) {
    const attrs = m[1];
    if (!/(?:class="[^"]*(?:logo|navbar-brand|breadcrumb)[^"]*")|(?:title="(?:Trang chủ|Home)")/i.test(attrs)) continue;
    const href = (attrs.match(/href="([^"]*)"/) || [])[1];
    candidates.push(href);
  }

  const hasHome = candidates.some((x) => x === '/' || x === '');
  if (hasHome) pagesWithAnyHome++;

  const dead = candidates.filter((x) => x === undefined || x === '#' || x === '/vi-nsg' || x === 'javascript:void(0)' || x === '');
  if (dead.length) {
    pagesWithDeadHome++;
    deadHomeLinks += dead.length;
    for (const d of dead) {
      const k = String(d);
      deadByHref.set(k, (deadByHref.get(k) || 0) + 1);
    }
    if (samples.length < 5) samples.push({ page: f.rel, dead: dead.slice(0, 3), all: candidates.slice(0, 4) });
  }
}

console.log(`有可用「回首页」链接的页面: ${pagesWithAnyHome} / ${files.length}`);
console.log(`存在死链（#/空/javascript/…/vi-nsg）的页面: ${pagesWithDeadHome}`);
console.log(`死链总数: ${deadHomeLinks}`);
if (deadByHref.size) {
  console.log('按 href 分布:');
  [...deadByHref.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${JSON.stringify(k)}  x${v}`));
}
samples.forEach((s) => console.log(`  样例 ${s.page}: dead=${JSON.stringify(s.dead)} all=${JSON.stringify(s.all)}`));

/* 抽一个页面看结构 */
console.log('\n=== 商品页面包屑结构 ===');
const p = files.find((x) => /vi-nsg[\\/]product[\\/]/.test(x.rel));
if (p) {
  const h = await readFile(p.full, 'utf8');
  const i = h.search(/breadcrumb/i);
  console.log(`页面: ${p.rel}`);
  if (i > -1) console.log(h.slice(Math.max(0, i - 80), i + 600).replace(/></g, '>\n<'));
}
