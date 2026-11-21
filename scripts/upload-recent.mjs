/**
 * 只上传「最近修改过」的文件（用于覆盖重抓的页面）。
 *   node scripts/upload-recent.mjs [--minutes N] [--conc N]
 */
import { readdir, stat, readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('.');
const SRC = path.join(ROOT, 'build', 'r2-site');
const ENDPOINT = 'https://vn-lotte-uploader.mating.workers.dev';
const KEY = 'u7K2pQx9Lm4Rn8Ts3Vw6Yz1Bc5Df0Gh';

const args = process.argv.slice(2);
const minutes = args.includes('--minutes') ? Number(args[args.indexOf('--minutes') + 1]) : 30;
const CONC = args.includes('--conc') ? Number(args[args.indexOf('--conc') + 1]) : 12;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject', '.txt': 'text/plain; charset=utf-8',
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

const cutoff = Date.now() - minutes * 60 * 1000;
const all = await walk(SRC);
const recent = [];
for (const f of all) {
  const st = await stat(f.full);
  if (st.mtimeMs >= cutoff) recent.push(f);
}
console.log(`最近 ${minutes} 分钟修改的文件: ${recent.length}`);
if (!recent.length) process.exit(0);

let done = 0, fail = 0;
const failed = [];
const started = Date.now();
let i = 0;

async function worker() {
  while (i < recent.length) {
    const item = recent[i++];
    const ext = path.extname(item.key).toLowerCase();
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const buf = await readFile(item.full);
        const res = await fetch(`${ENDPOINT}/upload?key=${encodeURIComponent(item.key)}`, {
          method: 'POST',
          headers: { 'x-upload-key': KEY, 'content-type': MIME[ext] || 'application/octet-stream' },
          body: buf,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        done++;
        break;
      } catch (e) {
        if (attempt === 2) { fail++; if (failed.length < 15) failed.push(`${item.key}: ${String(e).slice(0, 40)}`); }
        else await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
    const n = done + fail;
    if (n % 50 === 0) process.stdout.write(`\r  ${n}/${recent.length} ok=${done} fail=${fail}  ${((Date.now() - started) / 1000).toFixed(0)}s   `);
  }
}

await Promise.all(Array.from({ length: CONC }, worker));
console.log(`\n\nuploaded=${done} failed=${fail}  ${((Date.now() - started) / 1000).toFixed(0)}s`);
failed.forEach((f) => console.log('  ' + f));

const r = await fetch(`${ENDPOINT}/stats`, { headers: { 'x-upload-key': KEY } });
console.log('R2 objects now:', await r.text());
