/* [ltm-clone] LOTTE Mart Vietnam — storefront clone (sandbox fixture)
 * visual reference: https://www.lottemart.vn/ (snapshot 2026-11-20)
 * for internal testing / demo use only — not affiliated with LOTTE Mart
 */
/**
 * 下载 YouTube 封面（iframe 被 frame-src 'self' 拦，改成缩略图 + 外链）。
 *   node scripts/fetch-yt-thumbs.mjs
 */
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('.');
const PUBLIC = path.join(ROOT, 'public');

const html = await readFile(path.join(PUBLIC, 'index.html'), 'utf8');
const ids = [...html.matchAll(/https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]+)/g)].map((m) => m[1]);
const uniq = [...new Set(ids)];
console.log('youtube ids:', uniq);

for (const id of uniq) {
  const dest = path.join(PUBLIC, 'media', 'yt', `${id}.jpg`);
  const st = await stat(dest).catch(() => null);
  if (st && st.size > 0) { console.log(`skip ${id}`); continue; }
  for (const name of ['hqdefault', 'sddefault', 'mqdefault', 'maxresdefault']) {
    try {
      const res = await fetch(`https://i.ytimg.com/vi/${id}/${name}.jpg`);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 2000) continue;
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, buf);
      console.log(`ok ${id} ${name} ${buf.length}b`);
      break;
    } catch {}
  }
}
