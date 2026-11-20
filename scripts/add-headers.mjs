/**
 * 给所有手写源文件加统一文件标头（GitHub 同步用）。
 *   node scripts/add-headers.mjs
 *
 * 幂等：已带 [ltm-clone] 标记的文件会跳过。
 */
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('.');
const MARK = '[ltm-clone]';

const META = {
  project: 'LOTTE Mart Vietnam — storefront clone (sandbox fixture)',
  source: 'visual reference: https://www.lottemart.vn/ (snapshot 2026-11-20)',
  license: 'for internal testing / demo use only — not affiliated with LOTTE Mart',
};

const SKIP_DIRS = new Set(['node_modules', '.git', 'data', 'public/asset', 'public/media', 'public/_next', 'public/bp']);
const INCLUDE = [
  /^server\.mjs$/,
  /^scripts\/.+\.mjs$/,
  /^scripts\/.+\.py$/,
  /^public\/assets\/(clone|styles)\.(js|css)$/,
  /^README\.md$/,
  /^docs\/.+\.md$/,
];

function headerFor(file) {
  const ext = path.extname(file);
  if (ext === '.md') {
    return `<!-- ${MARK} ${META.project}\n${META.source}\n${META.license} -->\n`;
  }
  if (ext === '.html') {
    return `<!-- ${MARK} ${META.project}\n${META.source}\n${META.license} -->\n`;
  }
  return `/* ${MARK} ${META.project}\n * ${META.source}\n * ${META.license}\n */\n`;
}

async function* walk(dir) {
  let entries = [];
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const rel = path.relative(ROOT, full).replace(/\\/g, '/');
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || SKIP_DIRS.has(rel)) continue;
      yield* walk(full);
    } else {
      yield { full, rel };
    }
  }
}

let changed = 0, skipped = 0;

for await (const { full, rel } of walk(ROOT)) {
  if (!INCLUDE.some((re) => re.test(rel))) continue;
  const src = await readFile(full, 'utf8');
  if (src.includes(MARK)) { skipped++; continue; }
  const header = headerFor(rel);
  // shebang 保留在第一行
  if (src.startsWith('#!')) {
    const nl = src.indexOf('\n');
    await writeFile(full, src.slice(0, nl + 1) + header + src.slice(nl + 1), 'utf8');
  } else {
    await writeFile(full, header + src, 'utf8');
  }
  changed++;
  console.log('+ ' + rel);
}

console.log(`\nheaders added: ${changed}, already present: ${skipped}`);
