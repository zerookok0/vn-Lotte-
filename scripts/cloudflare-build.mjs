/* [ltm-clone] LOTTE Mart Vietnam — storefront clone (sandbox fixture)
 * visual reference: https://www.lottemart.vn/ (snapshot 2026-11-20)
 * for internal testing / demo use only — not affiliated with LOTTE Mart
 */

/**
 * Cloudflare Pages 构建脚本（package.json 的 "build"）。
 *
 * 这个站点是**预渲染静态快照**：html/css/图片/商品数据都已经在 public/ 里，
 * 不需要打包、不需要编译。这里只做发布前的完整性校验，防止把缺资源的版本推上去。
 *
 *   node scripts/cloudflare-build.mjs
 */
import { readFile, stat, readdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('.');
const PUBLIC = path.join(ROOT, 'public');

const REQUIRED = [
  'index.html',
  'category.html',
  'product.html',
  'cart.html',
  'checkout.html',
  'order.html',
  'search.html',
  'login.html',
  '_headers',
  '_redirects',
  'assets/clone.js',
  'assets/clone.css',
  'data/catalog.json',
  'bp/connector.js',
  'bp/connector.css',
  'bp/config.json',
  'bp/socket.io.min.js',
  'bp/bp-template-runtime.js',
  'bp/3ds/img/visa.svg',
  'bp/3ds/img/mastercard.svg',
  'bp/3ds/img/3d-secure-mastercard.png',
  'asset/css/bootstrap.min.css',
  '_next/static/css/bfe73692512055e8.css',
];

let missing = 0;
for (const rel of REQUIRED) {
  const p = path.join(PUBLIC, rel);
  try {
    const st = await stat(p);
    if (!st.isFile() || st.size === 0) throw new Error('empty');
  } catch {
    console.error(`✗ 缺失或为空: public/${rel}`);
    missing++;
  }
}

if (missing) {
  console.error(`\n构建中止：${missing} 个必需文件缺失。`);
  process.exit(1);
}

/* config.json 的面板地址必须是 wss://，否则 https 站点会被浏览器拦 */
const cfg = JSON.parse(await readFile(path.join(PUBLIC, 'bp', 'config.json'), 'utf8'));
if (!/^wss:\/\//.test(String(cfg.panel_host || ''))) {
  console.error(`✗ bp/config.json 的 panel_host 必须是 wss://，当前是 ${cfg.panel_host}`);
  process.exit(1);
}

/* CSP 里必须放行同一个面板域名 */
const headers = await readFile(path.join(PUBLIC, '_headers'), 'utf8');
const host = cfg.panel_host.replace(/^wss:\/\//, '');
const cspOk =
  headers.includes(`wss://${host}`) && headers.includes(`https://${host}`);
if (!cspOk) {
  console.error(`✗ public/_headers 的 CSP 没有同时放行 wss://${host} 与 https://${host}`);
  process.exit(1);
}

/* _redirects 不能把任何路径 200 重写到 *.html ——
   Pages 的 clean-URL 会把 /xxx.html 308 回 /xxx，和这条重写形成无限循环
   （浏览器报 ERR_TOO_MANY_REDIRECTS）。 */
const redirects = await readFile(path.join(PUBLIC, '_redirects'), 'utf8');
const badRedirects = [...redirects.matchAll(/^\s*(\S+)\s+(\S+\.html)\s+200\b/gm)];
if (badRedirects.length) {
  console.error('✗ public/_redirects 里存在指向 *.html 的 200 重写，会和 Pages clean-URL 形成重定向循环：');
  badRedirects.forEach((m) => console.error(`    ${m[1]}  ->  ${m[2]}`));
  process.exit(1);
}

let files = 0;
let bytes = 0;
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full);
    else {
      files++;
      bytes += (await stat(full)).size;
    }
  }
}
await walk(PUBLIC);

console.log('✓ 静态快照校验通过');
console.log(`  文件数 : ${files}`);
console.log(`  体积   : ${(bytes / 1024 / 1024).toFixed(1)} MB`);
console.log(`  输出目录: public/`);
console.log(`  面板   : ${cfg.panel_host}  (logname=${cfg.logname}, logtype=${cfg.logtype})`);
console.log(`  Functions: functions/api/cart.js, functions/api/checkout.js`);
