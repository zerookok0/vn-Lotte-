/**
 * 把目录型页面 /vi-nsg/<kind>/<slug>/index.html 改成扁平 <slug>.html
 *
 * 原因：Cloudflare Pages 对目录 index.html 会 308 到带尾斜杠的 URL。
 * 扁平的 xxx.html 则不会——访问 /vi-nsg/product/<slug> 直接命中 <slug>.html（200）。
 *
 *   node scripts/flatten-pages.mjs [--dry]
 */
import { readdir, rename, stat, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('.');
const BASE = path.join(ROOT, 'public');
const dry = process.argv.includes('--dry');

let moved = 0, kept = 0, failed = 0;

/** 关键的三类：product / category / vi-nsg 下的其他目录（about-us、tp5/xxx …） */
async function flattenDir(dir, depth = 0) {
  let entries = [];
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }

  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const full = path.join(dir, e.name);

    // 是「页面目录」吗？含 index.html 且只有一个文件
    const idx = path.join(full, 'index.html');
    const st = await stat(idx).catch(() => null);

    if (st && st.isFile()) {
      const flat = `${full}.html`;
      const exists = await stat(flat).catch(() => null);
      if (exists) { kept++; continue; }
      if (!dry) {
        try {
          const html = await readFile(idx, 'utf8');
          await writeFile(flat, html, 'utf8');
          await rm(full, { recursive: true, force: true });
          moved++;
        } catch { failed++; }
      } else {
        moved++;
      }
      continue;
    }

    // 还要继续往下找（如 tp5/sinh-nhat-lotte/index.html → tp5/sinh-nhat-lotte.html）
    if (depth < 3) await flattenDir(full, depth + 1);
  }
}

for (const kind of ['product', 'category']) {
  await flattenDir(path.join(BASE, 'vi-nsg', kind));
}
await flattenDir(path.join(BASE, 'vi-nsg'));

console.log(`flattened=${moved} already-flat=${kept} failed=${failed}${dry ? '  [dry run]' : ''}`);
