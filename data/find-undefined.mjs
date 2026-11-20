import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const dir = 'public';
const files = (await readdir(dir)).filter((f) => f.endsWith('.html'));
const re = /(?:src|href)="([^"]*undefined[^"]*)"/g;
const cssRe = /url\(([^)]*undefined[^)]*)\)/g;

for (const f of files) {
  const h = await readFile(path.join(dir, f), 'utf8');
  const hits = [...h.matchAll(re)].map((m) => m[1]);
  const cssHits = [...h.matchAll(cssRe)].map((m) => m[1]);
  if (hits.length || cssHits.length) {
    console.log(`\n${f}: ${hits.length} attr, ${cssHits.length} css`);
    console.log('  attrs:', [...new Set(hits)].slice(0, 5));
    console.log('  css  :', [...new Set(cssHits)].slice(0, 5));
    // 找上下文
    const i = h.indexOf(hits[0] || cssHits[0]);
    if (i > -1) console.log('  ctx  :', h.slice(Math.max(0, i - 160), i + 120));
  }
}
console.log('\ndone');
