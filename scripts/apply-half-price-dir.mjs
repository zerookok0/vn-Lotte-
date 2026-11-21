/**
 * 对指定目录下的 HTML 跑 5 折改造（用于抓取后的新页面）。
 *   node scripts/apply-half-price-dir.mjs build/r2-site [--dry]
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const dirArg = args.find((a) => !a.startsWith('--'));
const TARGET = path.resolve(dirArg || 'build/r2-site');
const dry = args.includes('--dry');

function halfPrice(o) { return Math.round(o / 2 / 100) * 100; }
function fmtVnd(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' ₫'; }
function parseVnd(t) { const d = String(t).replace(/[^\d]/g, ''); return d ? parseInt(d, 10) : 0; }

const DISCOUNT = '<span class="lbl-discount"><strong>Giảm giá</strong>-50%</span>';

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) await walk(f, out);
    else if (e.name.endsWith('.html')) out.push(f);
  }
  return out;
}

const files = await walk(TARGET);
console.log(`target: ${path.relative(process.cwd(), TARGET)}  html files: ${files.length}`);

let touched = 0, patched = 0, inserted = 0, skipped = 0;

for (const file of files) {
  const src = await readFile(file, 'utf8');
  let n = 0;
  let out = src;

  /* (a) 划线原价 + 现价 */
  out = out.replace(
    /<div class="(field-price-old[^"]*)">([\s\S]*?)<\/div>(\s*)<div class="(field-price(?!-)[^"]*)">([\s\S]*?)<\/div>/g,
    (m, clsOld, oldBody, gap, clsPrice, priceBody) => {
      const oldVal = parseVnd(oldBody);
      if (!oldVal) return m;
      n++;
      return `<div class="${clsOld}">${fmtVnd(oldVal)}</div>${gap}`
        + `<div class="${clsPrice}">${DISCOUNT}<span>${fmtVnd(halfPrice(oldVal))}</span></div>`;
    },
  );

  /* (b) 只有现价 */
  out = out.replace(
    /<div class="(field-price(?!-)[^"]*)">([\s\S]*?)<\/div>/g,
    (m, cls, body) => {
      if (/lbl-discount|Giảm giá/.test(body)) { skipped++; return m; }
      const val = parseVnd(body);
      if (!val) return m;
      n++;
      inserted++;
      const extra = cls.replace(/^field-price\s*/, '').trim();
      return `<div class="field-price-old ${extra}">${fmtVnd(val)}</div>`
        + `<div class="${cls}">${DISCOUNT}<span>${fmtVnd(halfPrice(val))}</span></div>`;
    },
  );

  if (n > 0) {
    patched += n;
    touched++;
    if (!dry) await writeFile(file, out, 'utf8');
  }
}

console.log(`files touched: ${touched}/${files.length}`);
console.log(`price nodes patched: ${patched}（新增划线 ${inserted}，跳过已带折扣 ${skipped}）`);
console.log(dry ? '[dry run]' : 'done');
