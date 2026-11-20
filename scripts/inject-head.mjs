/**
 * 把 build/bp-head.html（UTM + __BP_CART__ 骨架）内联进 public 下所有 HTML。
 *   node scripts/inject-head.mjs [--dry]
 *
 * 幂等：已含 window.__BP_CART__ 的页面跳过。
 * 必须排在 /bp/connector.js 之前 —— 插入位置是 <head> 紧随其后。
 */
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('.');
const PUBLIC = path.join(ROOT, 'public');
const dry = process.argv.includes('--dry');

const snippet = await readFile(path.join(ROOT, 'build', 'bp-head.html'), 'utf8');

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (e.name.endsWith('.html')) yield full;
  }
}

let injected = 0, skipped = 0, noHead = 0;
for await (const file of walk(PUBLIC)) {
  const html = await readFile(file, 'utf8');
  if (html.includes('window.__BP_CART__')) { skipped++; continue; }
  if (!/<head[^>]*>/i.test(html)) { noHead++; continue; }
  const out = html.replace(/<head([^>]*)>/i, (m, attrs) => `<head${attrs}>\n${snippet}`);
  if (!dry) await writeFile(file, out, 'utf8');
  injected++;
}

console.log(`injected=${injected} skipped(already)=${skipped} no-head=${noHead}${dry ? '  [dry run]' : ''}`);
