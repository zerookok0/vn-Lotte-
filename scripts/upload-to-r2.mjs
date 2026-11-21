/**
 * 把 build/r2-site 全量上传到 R2（通过临时 uploader Worker）。
 *   node scripts/upload-to-r2.mjs [--dry] [--conc N]
 *
 * 断点续传：先从 /keys 拉已存在的对象列表，跳过。
 */
import { readdir, stat, readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('.');
const SRC = path.join(ROOT, 'build', 'r2-site');
const ENDPOINT = 'https://vn-lotte-uploader.mating.workers.dev';
const KEY = 'u7K2pQx9Lm4Rn8Ts3Vw6Yz1Bc5Df0Gh';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const CONC = args.includes('--conc') ? Number(args[args.indexOf('--conc') + 1]) : 16;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.txt': 'text/plain; charset=utf-8',
};

async function walk(dir, rel = '', out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    const relPath = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) await walk(full, relPath, out);
    else out.push({ full, key: relPath.replace(/\\/g, '/') });
  }
  return out;
}

/* 1. 本地文件清单 */
const files = await walk(SRC);
console.log(`local files: ${files.length}`);

/* 2. 已在 R2 的 key */
let existing = new Set();
try {
  const res = await fetch(`${ENDPOINT}/keys`, { headers: { 'x-upload-key': KEY } });
  const j = await res.json();
  existing = new Set(j.keys || []);
  console.log(`already in R2: ${existing.size}`);
} catch (e) {
  console.log('list failed, uploading everything:', String(e).slice(0, 60));
}

const todo = files.filter((f) => !existing.has(f.key));
console.log(`to upload: ${todo.length}`);
if (dry) {
  console.log('[dry] 前 5 个:', todo.slice(0, 5).map((t) => t.key));
  process.exit(0);
}
if (!todo.length) process.exit(0);

/* 3. 并发上传 */
let done = 0, fail = 0;
const failed = [];
const started = Date.now();
const totalBytes = (await Promise.all(todo.map((t) => stat(t.full).then((s) => s.size)))).reduce((a, b) => a + b, 0);
console.log(`payload: ${(totalBytes / 1024 / 1024).toFixed(0)} MB`);

let i = 0;
async function worker() {
  while (i < todo.length) {
    const item = todo[i++];
    const ext = path.extname(item.key).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const buf = await readFile(item.full);
        const res = await fetch(`${ENDPOINT}/upload?key=${encodeURIComponent(item.key)}`, {
          method: 'POST',
          headers: { 'x-upload-key': KEY, 'content-type': type },
          body: buf,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        done++;
        break;
      } catch (e) {
        if (attempt === 2) { fail++; if (failed.length < 20) failed.push(`${item.key}: ${String(e).slice(0, 50)}`); }
        else await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
    const n = done + fail;
    if (n % 200 === 0) {
      const el = (Date.now() - started) / 1000;
      const rate = n / Math.max(1, el);
      process.stdout.write(`\r  ${n}/${todo.length}  ok=${done} fail=${fail}  ${el.toFixed(0)}s  ${rate.toFixed(0)}/s  ETA ${((todo.length - n) / rate / 60).toFixed(0)}min   `);
    }
  }
}

await Promise.all(Array.from({ length: CONC }, worker));

console.log(`\n\nuploaded=${done} failed=${fail}  ${((Date.now() - started) / 1000 / 60).toFixed(1)}min`);
if (failed.length) failed.forEach((f) => console.log('  ' + f));

/* 4. 复查总数 */
try {
  const r = await fetch(`${ENDPOINT}/stats`, { headers: { 'x-upload-key': KEY } });
  console.log('R2 objects now:', await r.text());
} catch {}
