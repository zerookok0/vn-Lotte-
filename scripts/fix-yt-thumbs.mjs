/**
 * 补齐 /media/yt/<id>.jpg —— 原站对这类图返回 403，改从 i.ytimg.com 直接取。
 *   node scripts/fix-yt-thumbs.mjs
 */
import { writeFile, mkdir, stat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const PUBLIC = path.resolve('public');

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, out);
    else if (e.name.endsWith('.html')) out.push(full);
  }
  return out;
}

const files = await walk(PUBLIC);
const ids = new Set();
for (const f of files) {
  const h = await readFile(f, 'utf8');
  for (const m of h.matchAll(/\/media\/yt\/([A-Za-z0-9_-]{6,20})\.jpg/g)) ids.add(m[1]);
}
console.log(`youtube thumb ids referenced: ${ids.size}`);

let ok = 0, skip = 0, fail = 0;
for (const id of ids) {
  const dest = path.join(PUBLIC, 'media', 'yt', `${id}.jpg`);
  const st = await stat(dest).catch(() => null);
  if (st && st.size > 1000) { skip++; continue; }
  let done = false;
  for (const name of ['hqdefault', 'mqdefault', 'sddefault', 'maxresdefault']) {
    try {
      const res = await fetch(`https://i.ytimg.com/vi/${id}/${name}.jpg`);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1000) continue;
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, buf);
      ok++; done = true;
      break;
    } catch {}
  }
  if (!done) { fail++; console.log(`  ✗ ${id}`); }
}

console.log(`downloaded=${ok} skipped=${skip} failed=${fail}`);
