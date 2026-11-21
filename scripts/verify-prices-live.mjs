/**
 * 价格一致性抽检：随机商品页，验证「现价 = 原价/2 四舍五入到百位」且标签是 -50%
 *   node scripts/verify-prices-live.mjs [baseUrl] [count]
 */
import { readFile } from 'node:fs/promises';

const BASE = process.argv[2] || 'https://vn-lotte.mating.workers.dev';
const COUNT = Number(process.argv[3] || 25);

const full = JSON.parse(await readFile('public/data/products-full.json', 'utf8'));
const products = full.products;

function halfPrice(o) { return Math.round(o / 2 / 100) * 100; }
const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

const step = Math.floor(products.length / COUNT);
let pass = 0, fail = 0;
const bad = [];

for (let i = 0; i < products.length && pass + fail < COUNT; i += step) {
  const p = products[i];
  try {
    const res = await fetch(BASE + p.url, { headers: { accept: 'text/html' } });
    const html = await res.text();

    // 抓主商品价格区：第一个 field-price-old 后面紧跟的 field-price
    const m = html.match(/<div class="field-price-old[^"]*">([\d.]+)\s*₫<\/div>\s*<div class="field-price[^"]*">([\s\S]{0,220}?)<\/div>/);
    if (!m) { fail++; bad.push({ url: p.url, reason: '找不到价格区' }); continue; }

    const oldVal = parseInt(m[1].replace(/\./g, ''), 10);
    const priceBlock = m[2];
    const priceMatch = priceBlock.match(/([\d.]+)\s*₫/);
    const priceVal = priceMatch ? parseInt(priceMatch[1].replace(/\./g, ''), 10) : 0;
    const has50 = /-50%/.test(priceBlock);

    const expected = halfPrice(oldVal);
    const okPrice = priceVal === expected;
    const okTag = has50;
    const okTrailing = String(priceVal).slice(-2) === '00';

    if (okPrice && okTag && okTrailing) pass++;
    else {
      fail++;
      bad.push({ url: p.url.split('/').pop().slice(0, 40), old: oldVal, got: priceVal, expected, has50, okTrailing });
    }
  } catch (e) {
    fail++;
    bad.push({ url: p.url, reason: String(e).slice(0, 40) });
  }
}

console.log(`价格抽检：${pass} 通过 / ${fail} 失败（共 ${pass + fail} 个）`);
bad.slice(0, 8).forEach((b) => console.log('  ✗', JSON.stringify(b)));
if (fail) process.exitCode = 1;
