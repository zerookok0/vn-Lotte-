import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, out);
    else if (e.name.endsWith('.html')) out.push(full);
  }
  return out;
}

const files = await walk('public');
let shown = 0;

for (const f of files) {
  const h = await readFile(f, 'utf8');
  // 找「同一张卡里出现两次 field-price」或「old 后面紧跟两个 price」
  const re = /<div class="(field-price[^"]*)">/g;
  let m;
  let count = 0;
  const idxs = [];
  while ((m = re.exec(h)) && count < 3) { idxs.push(m.index); count++; }

  // 找 old + price + price 的连排
  const dup = h.match(/field-price-old[^>]*>[\s\S]{0,200}?field-price[^>]*>[\s\S]{0,200}?field-price[^>]*>/);
  if (dup && shown < 4) {
    console.log(`\n=== ${path.relative('public', f)} ===`);
    const i = h.indexOf(dup[0]);
    console.log(h.slice(Math.max(0, i - 120), i + dup[0].length + 260).replace(/></g, '>\n<'));
    shown++;
  }
}
if (!shown) {
  // 退而求其次：直接打印一个带 old 的卡片价格区
  for (const f of files) {
    const h = await readFile(f, 'utf8');
    const i = h.indexOf('field-price-old');
    if (i > -1) {
      console.log(`\n=== ${path.relative('public', f)} (first old) ===`);
      console.log(h.slice(Math.max(0, i - 100), i + 420).replace(/></g, '>\n<'));
      break;
    }
  }
}
