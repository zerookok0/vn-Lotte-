/**
 * 全站 5 折改造：以「显示原价」为基准，÷2 后四舍五入到百位（十位和个位固定 00）。
 *   29500 -> 14750 -> 14800
 *
 * 同时处理数据层（购物车/结账/搜索/模板渲染）和 HTML 层（861 个快照页）。
 *   node scripts/apply-half-price.mjs [--dry]
 */
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('.');
const PUBLIC = path.join(ROOT, 'public');
const dry = process.argv.includes('--dry');

/** 5 折 + 进位到百位 */
function halfPrice(original) {
  return Math.round(original / 2 / 100) * 100;
}

/** 越南盾格式：14800 -> "14.800 ₫" */
function fmtVnd(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' ₫';
}

/** 从 "134.900 ₫" / "134.900&nbsp;₫" 里取出 134900 */
function parseVnd(text) {
  const digits = String(text).replace(/[^\d]/g, '');
  return digits ? parseInt(digits, 10) : 0;
}

/* ======================= 1. 数据层 ======================= */
let dataStats = { files: 0, products: 0 };

async function rewriteJson(file, pickProducts, apply) {
  const raw = JSON.parse(await readFile(file, 'utf8'));
  const list = pickProducts(raw);
  let n = 0;
  for (const p of list) {
    const original = Number(p.price) || 0;
    if (!original) continue;
    const now = halfPrice(original);
    p.price_original = original;          // 原名不变，另存一份便于回溯
    p.special_price = now;
    p.special_price_formatted = fmtVnd(now);
    p.price_formatted = fmtVnd(original);
    apply && apply(p);
    n++;
  }
  if (!dry) await writeFile(file, JSON.stringify(raw), 'utf8');
  dataStats.files++;
  dataStats.products += n;
  console.log(`  ${path.relative(ROOT, file).padEnd(34)} ${String(n).padStart(6)} 条`);
}

console.log('=== 数据层 ===');
await rewriteJson(path.join(PUBLIC, 'data', 'products-full.json'), (j) => j.products);
await rewriteJson(path.join(PUBLIC, 'data', 'catalog.json'), (j) => j.products);

/* 分片：按 sku 前缀 */
const shardDir = path.join(PUBLIC, 'data', 'p');
let shardCount = 0;
for (const f of (await readdir(shardDir)).filter((x) => x.endsWith('.json'))) {
  const file = path.join(shardDir, f);
  const raw = JSON.parse(await readFile(file, 'utf8'));
  let n = 0;
  for (const p of raw.products || []) {
    const original = Number(p.price) || 0;
    if (!original) continue;
    const now = halfPrice(original);
    p.price_original = original;
    p.special_price = now;
    p.special_price_formatted = fmtVnd(now);
    p.price_formatted = fmtVnd(original);
    n++;
  }
  if (!dry) await writeFile(file, JSON.stringify(raw), 'utf8');
  shardCount += n;
}
console.log(`  ${'data/p/*.json (分片)'.padEnd(34)} ${String(shardCount).padStart(6)} 条`);

/* 搜索索引：[sku, name, url, price, image] —— 第 4 位改成折后价 */
{
  const file = path.join(PUBLIC, 'data', 'search-index.json');
  const rows = JSON.parse(await readFile(file, 'utf8'));
  let n = 0;
  for (const row of rows) {
    const original = Number(row[3]) || 0;
    if (!original) continue;
    row[3] = halfPrice(original);
    n++;
  }
  if (!dry) await writeFile(file, JSON.stringify(rows), 'utf8');
  console.log(`  ${'data/search-index.json'.padEnd(34)} ${String(n).padStart(6)} 条`);
}

/* ======================= 2. HTML 层 ======================= */
console.log('\n=== HTML 层 ===');

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, out);
    else if (e.name.endsWith('.html')) out.push(full);
  }
  return out;
}

const htmlFiles = await walk(PUBLIC);
let htmlTouched = 0, pricePatched = 0, oldInserted = 0;

for (const file of htmlFiles) {
  const src = await readFile(file, 'utf8');
  let n = 0;
  let out = src;

  /* (a) old + price 组合：old 是原价，price 里带折扣标签和现价 */
  out = out.replace(
    /(<div class=")(field-price-old\s*)([^"]*)(">)([\s\S]*?)(<\/div>\s*<div class=")(field-price\s*)([^"]*)(">)([\s\S]*?)(<\/div>)/g,
    (m, p1, clsOld, clsOldRest, p3, oldBody, mid, clsPrice, clsPriceRest, p4, priceBody, end) => {
      const oldVal = parseVnd(oldBody);
      if (!oldVal) return m;
      const now = halfPrice(oldVal);
      n++;
      const newPriceBody = '<span class="lbl-discount"><strong>Giảm giá</strong>-50%</span><span>' + fmtVnd(now) + '</span>';
      return p1 + clsOld + clsOldRest + p4 + fmtVnd(oldVal) + mid + clsPrice + clsPriceRest + p4 + newPriceBody + end;
    },
  );

  /* (b) 单个 field-price（没有 old）：把当前显示价当原价，追加划线原价 + 折扣标签 */
  out = out.replace(
    /(<div class=")(field-price\s*)([^"]*)(">)(?!<span class="lbl-discount)([\s\S]*?)(<\/div>)/g,
    (m, p1, cls, rest, p3, body, end) => {
      const val = parseVnd(body);
      if (!val) return m;
      // 已经处理过的（里面有强标签或 50%）跳过
      if (/lbl-discount|Giảm giá/.test(body)) return m;
      n++;
      oldInserted++;
      return '<div class="field-price-old ' + rest + '">' + fmtVnd(val) + '</div>'
        + '<div class="' + cls + rest + '"><span class="lbl-discount"><strong>Giảm giá</strong>-50%</span><span>' + fmtVnd(halfPrice(val)) + '</span></div>';
    },
  );

  if (n > 0) {
    pricePatched += n;
    htmlTouched++;
    if (!dry) await writeFile(file, out, 'utf8');
  }
}

console.log(`  html files touched: ${htmlTouched} / ${htmlFiles.length}`);
console.log(`  price nodes patched: ${pricePatched}（其中新增划线原价 ${oldInserted}）`);

console.log(`\n数据层: ${dataStats.files} 个 json，${dataStats.products} 条商品`);
console.log(dry ? '[dry run，未写入]' : '完成');
