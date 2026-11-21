/**
 * 用 Cloudflare REST API 直传（不走 workers.dev，绕过其 429 限流）
 *   node scripts/upload-r2-api.mjs [--minutes N] [--conc N] [--only home|category|product]
 *
 * 说明：wrangler CLI 每个文件要起一次进程，太慢；这里直接打 R2 的 S3 端点不可行
 * （需要 S3 凭证），所以用「重新部署 uploader 换域名」之外的唯一稳路：
 * 走 Cloudflare API 的 R2 对象写入需要 S3 签名，故改用 wrangler 批量、低并发。
 */
import { readdir, stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ROOT = path.resolve('.');
const SRC = path.join(ROOT, 'build', 'r2-site');
const BUCKET = 'vn-lotte';

const args = process.argv.slice(2);
const minutes = args.includes('--minutes') ? Number(args[args.indexOf('--minutes') + 1]) : 30;
const CONC = args.includes('--conc') ? Number(args[args.indexOf('--conc') + 1]) : 6;
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : '';

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.txt': 'text/plain',
};

async function walk(dir, rel = '', out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) await walk(full, r, out);
    else out.push({ full, key: r.replace(/\\/g, '/') });
  }
  return out;
}

const cutoff = Date.now() - minutes * 60 * 1000;
const all = await walk(SRC);
let todo = [];
for (const f of all) {
  const st = await stat(f.full);
  if (st.mtimeMs < cutoff) continue;
  if (only === 'home' && f.key !== 'index.html') continue;
  if (only === 'category' && !/^vi-nsg\/category\//.test(f.key)) continue;
  if (only === 'product' && !/^vi-nsg\/product\//.test(f.key)) continue;
  todo.push(f);
}
console.log(`待上传: ${todo.length}（最近 ${minutes} 分钟改动）`);
if (!todo.length) process.exit(0);

let ok = 0, fail = 0;
const started = Date.now();
let i = 0;

async function worker() {
  while (i < todo.length) {
    const item = todo[i++];
    const ct = MIME[path.extname(item.key).toLowerCase()] || 'application/octet-stream';
    try {
      await run('npx', ['wrangler', 'r2', 'object', 'put', `${BUCKET}/${item.key}`, `--file=${item.full}`, `--content-type=${ct}`, '--remote'], {
        cwd: ROOT,
        env: process.env,
        maxBuffer: 4 * 1024 * 1024,
        shell: true,
      });
      ok++;
    } catch (e) {
      fail++;
      if (fail <= 3) console.log(`  FAIL ${item.key}: ${String(e.stdout || e.message).slice(0, 100)}`);
    }
    const n = ok + fail;
    if (n % 25 === 0) {
      const el = (Date.now() - started) / 1000;
      const rate = n / Math.max(1, el);
      process.stdout.write(`\r  ${n}/${todo.length} ok=${ok} fail=${fail} ${rate.toFixed(1)}/s ETA ${((todo.length - n) / rate / 60).toFixed(0)}min   `);
    }
  }
}

await Promise.all(Array.from({ length: CONC }, worker));
console.log(`\n\n完成 ok=${ok} fail=${fail}  ${((Date.now() - started) / 1000 / 60).toFixed(1)}min`);
