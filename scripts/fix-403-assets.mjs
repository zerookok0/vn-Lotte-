/**
 * 用真实浏览器上下文（带 referer/cookie）再试一次那批 403 资源。
 *   node scripts/fix-403-assets.mjs
 */
import { chromium } from 'playwright-core';
import { readFile, writeFile, mkdir, stat, readdir } from 'node:fs/promises';
import path from 'node:path';

const PUBLIC = path.resolve('public');
const HOST = 'https://www.lottemart.vn';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const refRe = /(?:src|href)="(\/[^"]+)"/g;
const urlRe = /url\((['"]?)(\/[^'")]+)\1\)/g;

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, out);
    else if (e.name.endsWith('.html')) out.push(full);
  }
  return out;
}

const files = await walk(PUBLIC);
const all = new Set();
for (const f of files) {
  const h = await readFile(f, 'utf8');
  for (const m of h.matchAll(refRe)) all.add(m[1]);
  for (const m of h.matchAll(urlRe)) all.add(m[2]);
}

const missing = [];
for (const rel of all) {
  if (!/^\/(media|asset|_next)\//.test(rel)) continue;
  const st = await stat(path.join(PUBLIC, decodeURIComponent(rel))).catch(() => null);
  if (!st || st.size === 0) missing.push(rel);
}
console.log(`still missing: ${missing.length}`);
if (!missing.length) process.exit(0);

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ locale: 'vi-VN', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' });
const page = await ctx.newPage();
await page.goto(HOST + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(2500);

let ok = 0, fail = 0;
for (const rel of missing) {
  try {
    const b64 = await page.evaluate(async (u) => {
      const r = await fetch(u, { credentials: 'include' });
      if (!r.ok) return { status: r.status };
      const buf = await r.arrayBuffer();
      let bin = '';
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return { status: 200, b64: btoa(bin), type: r.headers.get('content-type') || '' };
    }, rel);

    if (b64.status === 200 && b64.b64) {
      const buf = Buffer.from(b64.b64, 'base64');
      const dest = path.join(PUBLIC, decodeURIComponent(rel));
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, buf);
      console.log(`  ✓ ${rel}  ${(buf.length / 1024).toFixed(0)} KB`);
      ok++;
    } else {
      console.log(`  ✗ ${rel}  status=${b64.status}`);
      fail++;
    }
  } catch (e) {
    console.log(`  ✗ ${rel}  ${String(e).slice(0, 50)}`);
    fail++;
  }
}

await browser.close();
console.log(`\nfixed=${ok} still-failing=${fail}`);
