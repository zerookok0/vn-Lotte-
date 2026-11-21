/**
 * 线上全站链接体检（真 HTTP，并发）
 *   node data/audit-http-links.mjs [baseUrl]
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.argv[2] || 'https://vn-lotte.mating.workers.dev';
const SITE = path.resolve('build/r2-site');
const CONC = 40;

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
console.log(`scanning ${files.length} html …`);

const links = new Map();
for (const f of files) {
  const h = await readFile(f.full, 'utf8');
  for (const m of h.matchAll(/\shref="([^"#][^"]*)"/g)) {
    const href = m[1];
    if (!href.startsWith('/') || href.startsWith('//')) continue;
    if (/\.(jpg|jpeg|png|webp|gif|svg|ico|css|js|woff2?|ttf|mp4|pdf|xml|txt)$/i.test(href)) continue;
    const clean = href.split('?')[0].split('#')[0];
    if (!links.has(clean)) links.set(clean, 0);
    links.set(clean, links.get(clean) + 1);
  }
}
console.log(`unique internal links: ${links.size}`);

const list = [...links.keys()];
let i = 0, ok = 0;
const bad = [];

async function worker() {
  while (i < list.length) {
    const p = list[i++];
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(BASE + p, { method: 'GET', redirect: 'manual', signal: ctrl.signal, headers: { 'user-agent': 'link-audit' } });
      clearTimeout(t);
      const code = res.status;
      if (code >= 200 && code < 400) ok++;
      else bad.push({ p, code, refs: links.get(p) });
    } catch (e) {
      bad.push({ p, code: 'ERR', refs: links.get(p) });
    }
    if ((ok + bad.length) % 500 === 0) process.stdout.write(`\r  ${ok + bad.length}/${list.length}  ok=${ok} bad=${bad.length}   `);
  }
}

await Promise.all(Array.from({ length: CONC }, worker));

console.log(`\n\n有效: ${ok}   异常: ${bad.length}   （共 ${list.length}）`);
if (bad.length) {
  const byCode = {};
  bad.forEach((b) => { byCode[b.code] = (byCode[b.code] || 0) + 1; });
  console.log('按状态码:', JSON.stringify(byCode));
  console.log('\n=== 异常链接（按引用量排序）===');
  bad.sort((a, b) => b.refs - a.refs).slice(0, 40).forEach((b) => {
    console.log(`  ${String(b.code).padEnd(4)} refs=${String(b.refs).padStart(4)}  ${b.p}`);
  });
}
