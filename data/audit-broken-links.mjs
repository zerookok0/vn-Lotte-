/**
 * 全站链接体检：找出点开就会 404 的链接
 *   node data/audit-broken-links.mjs
 *
 * 按 Worker 的路由规则把站内链接映射到文件，检查文件是否存在。
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const SITE = path.resolve('build/r2-site');
const exists = async (p) => { try { await stat(p); return true; } catch { return false; } };

async function walk(dir, rel = '', out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) await walk(full, r, out);
    else if (e.name.endsWith('.html')) out.push({ full, rel: r });
  }
  return out;
}

/* Worker 的路由规则（与 worker/index.js resolveKey 保持一致） */
const FIXED = {
  '/cart': 'cart.html', '/checkout': 'checkout.html', '/search': 'search.html', '/login': 'login.html',
  '/vi-nsg/cart': 'cart.html', '/vi-nsg/checkout': 'checkout.html',
  '/vi-nsg/login': 'login.html', '/vi-nsg/search': 'search.html',
};

function resolveKey(pathname) {
  if (pathname === '/' || pathname === '') return 'index.html';
  if (FIXED[pathname]) return FIXED[pathname];
  if (pathname.startsWith('/order/')) return 'order.html';
  let key = pathname.replace(/^\/+/, '');
  if (/^vi-nsg\/product\/[^/]+$/.test(key) || /^vi-nsg\/category\/[^/]+$/.test(key)) return key + '.html';
  if (/^vi-nsg\/[^/]+$/.test(key) && !/\.[a-z0-9]+$/i.test(key)) return key + '.html';
  if (/^vi-nsg\/(tp\d+)\/[^/]+$/.test(key)) return key + '.html';
  return key;
}

const files = await walk(SITE);
console.log(`扫描 ${files.length} 个 HTML\n`);

const links = new Map();   // href -> Set(来源页面)
const pageBroken = new Map(); // 页面 -> [坏链接]

for (const f of files) {
  const h = await readFile(f.full, 'utf8');
  const hrefs = new Set();
  for (const m of h.matchAll(/\shref="([^"#][^"]*)"/g)) hrefs.add(m[1]);
  for (const href of hrefs) {
    if (!href.startsWith('/') || href.startsWith('//')) continue;   // 只看站内绝对路径
    if (/\.(jpg|jpeg|png|webp|gif|svg|ico|css|js|woff2?|ttf|mp4|pdf)$/i.test(href)) continue;  // 资源另算
    const clean = href.split('?')[0].split('#')[0];
    if (!links.has(clean)) links.set(clean, new Set());
    links.get(clean).add(f.rel);
  }
}

console.log(`站内页面链接（去重）: ${links.size}`);

let ok = 0;
const broken = [];
for (const [p, from] of links) {
  const key = resolveKey(p);
  let found = (await exists(path.join(SITE, key)))
    || (await exists(path.join(SITE, key + '.html')))
    || (await exists(path.join(SITE, key.replace(/\/+$/, ''), 'index.html')));
  if (found) ok++;
  else broken.push({ path: p, from: [...from].slice(0, 3), count: from.size });
}

console.log(`有效: ${ok}   失效: ${broken.length}\n`);
if (broken.length) {
  console.log('=== 点开就 404 的链接 ===');
  broken.sort((a, b) => b.count - a.count).forEach((b) => {
    console.log(`  ${b.path}`);
    console.log(`      出现在 ${b.count} 个页面，例如: ${b.from.join(', ')}`);
  });
}

/* 顺便统计资源链接（img src / css / js）是否缺文件 */
let resChecked = 0;
const resMissing = new Map();
for (const f of files) {
  const h = await readFile(f.full, 'utf8');
  for (const m of h.matchAll(/\s(?:src|href)="(\/(?:media|asset|assets|data|bp|_next)\/[^"]+)"/g)) {
    const p = m[1].split('?')[0];
    resChecked++;
    if (!resMissing.has(p)) {
      const local = path.join(SITE, p.replace(/^\/+/, ''));
      if (!(await exists(local))) resMissing.set(p, new Set());
    }
    if (resMissing.has(p)) resMissing.get(p).add(f.rel);
  }
}
console.log(`\n资源链接检查: ${resChecked} 处引用，缺失 ${resMissing.size} 个文件`);
[...resMissing.entries()].slice(0, 10).forEach(([p, from]) => console.log(`  ${p}  ← ${[...from].slice(0, 2).join(', ')}`));
