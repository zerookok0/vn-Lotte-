/**
 * 给「无 href 的分类图标链接」补真实分类页地址（从 catalog 自动模糊匹配）。
 *   node scripts/fix-dead-category-links.mjs [--dry]
 *
 * 匹配顺序：精确 → 去重音精确 → 双向包含 → 词级重合度
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('.');
const DIRS = ['public', 'build/r2-site'];
const dry = process.argv.includes('--dry');

const cat = JSON.parse(await readFile(path.join(ROOT, 'public', 'data', 'catalog.json'), 'utf8'));
const cats = (cat.categoriesFlat || cat.categories || []).filter((c) => c.url && c.name);

const strip = (s) => String(s || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd').replace(/Đ/g, 'D')
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

const byExact = new Map();
const byStripped = new Map();
for (const c of cats) {
  byExact.set(norm(c.name).toLowerCase(), c.url);
  const st = strip(c.name);
  if (!byStripped.has(st)) byStripped.set(st, c.url);
}

function lookup(title) {
  const t = norm(title);
  const tl = t.toLowerCase();
  if (byExact.has(tl)) return byExact.get(tl);

  const ts = strip(t);
  if (byStripped.has(ts)) return byStripped.get(ts);

  // 双向包含
  for (const c of cats) {
    const cs = strip(c.name);
    if (!cs || cs.length < 4) continue;
    if (ts === cs || ts.includes(cs) || cs.includes(ts)) return c.url;
  }

  // 词级重合度（>= 60% 且至少 2 个词）
  const tw = new Set(ts.split(' ').filter((w) => w.length > 2));
  let best = null, bestScore = 0;
  for (const c of cats) {
    const cw = new Set(strip(c.name).split(' ').filter((w) => w.length > 2));
    if (!cw.size || !tw.size) continue;
    let hit = 0;
    for (const w of tw) if (cw.has(w)) hit++;
    const score = hit / Math.max(tw.size, cw.size);
    if (score > bestScore) { bestScore = score; best = c.url; }
  }
  return bestScore >= 0.6 ? best : null;
}

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) await walk(f, out);
    else if (e.name.endsWith('.html')) out.push(f);
  }
  return out;
}

let touched = 0, fixed = 0, fallback = 0;
const unmatched = new Set();

for (const base of DIRS) {
  const files = await walk(path.join(ROOT, base));
  for (const file of files) {
    const src = await readFile(file, 'utf8');
    let n = 0;
    const out = src.replace(
      /<a\b(?![^>]*\shref=)([^>]*?)title="([^"]*)"([^>]*)>(\s*<img[^>]*delivery-tab-logo)/g,
      (m, pre, title, post, tail) => {
        const url = lookup(title);
        if (!url) {
          // 没有对应分类页（品牌名/活动名）→ 落到搜索页，保证可点
          const q = encodeURIComponent(norm(title));
          if (!q) return m;
          unmatched.add(norm(title));
          fallback++;
          n++;
          return `<a${pre}href="/search?q=${q}" title="${title}"${post}>${tail}`;
        }
        n++;
        return `<a${pre}href="${url}" title="${title}"${post}>${tail}`;
      },
    );
    if (n > 0) { touched++; fixed += n; if (!dry) await writeFile(file, out, 'utf8'); }
  }
}

console.log(`files touched=${touched}  links fixed=${fixed}（其中走搜索兜底 ${fallback}）${dry ? '  [dry]' : ''}`);
if (unmatched.size) {
  console.log(`无对应分类页、已改为跳搜索的 ${unmatched.size} 个：`);
  [...unmatched].slice(0, 25).forEach((u) => console.log('  ' + u));
}
