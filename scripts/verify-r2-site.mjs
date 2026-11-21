/**
 * R2 站点全量自检
 *   node scripts/verify-r2-site.mjs [baseUrl]
 *
 * 覆盖：路由、变体不串页、随机抽样、分类页、专题页、接口、CSP、资源 404
 */
import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.argv[2] || 'https://vn-lotte.mating.workers.dev';

const results = [];
const ok = (n, p, d = '') => { results.push({ n, p }); console.log(`  ${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };

const full = JSON.parse(await readFile('public/data/products-full.json', 'utf8'));
const products = full.products;

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
const page = await ctx.newPage();

/* ---------------- 1. 变体不串页 ---------------- */
console.log('\n=== 1. 变体页（同名多 SKU）不串页 ===');
const nameMap = new Map();
for (const p of products) {
  const n = String(p.name || '').trim().toLowerCase();
  if (!n) continue;
  if (!nameMap.has(n)) nameMap.set(n, []);
  nameMap.get(n).push(p);
}
const variants = [...nameMap.entries()].filter(([, v]) => v.length > 1);
console.log(`  变体组: ${variants.length}`);

let variantOk = 0, variantFail = 0;
const variantFailures = [];

for (const [name, group] of variants.slice(0, 12)) {
  const sigs = [];
  for (const p of group.slice(0, 2)) {
    try {
      await page.goto(BASE + p.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      const sig = await page.evaluate((sku) => {
        const price = document.querySelector('.field-price');
        return {
          title: document.title,
          price: price ? price.textContent.trim() : '',
          path: location.pathname,
          hasOwnSku: document.documentElement.innerHTML.includes(sku),
        };
      }, String(p.sku));
      sigs.push(sig);
    } catch (e) {
      sigs.push({ error: String(e).slice(0, 40) });
    }
  }
  // 判定：两条 URL 各自落地且页面里能找到自己的 SKU。
  // （原站的 canonical 会省掉一个 sku 段，不能拿它做等值比较）
  const landed = sigs.length === 2
    && sigs.every((s) => !s.error && s.path && s.title && s.price && s.hasOwnSku)
    && sigs[0].path !== sigs[1].path;
  if (landed) variantOk++;
  else { variantFail++; variantFailures.push({ name: name.slice(0, 30), sigs }); }
}
ok(`变体页各自落地（抽查 ${Math.min(12, variants.length)} 组）`, variantFail === 0, `${variantOk} 组正确 / ${variantFail} 组异常`);
if (variantFailures.length) {
  variantFailures.slice(0, 2).forEach((v) => console.log(`    ${v.name}: ${JSON.stringify(v.sigs)}`));
}

/* ---------------- 2. 随机抽样商品页 ---------------- */
console.log('\n=== 2. 随机抽样商品页 ===');
const sampleSize = 25;
const sample = [];
const step = Math.floor(products.length / sampleSize);
for (let i = 0; i < products.length && sample.length < sampleSize; i += step) sample.push(products[i]);

let sampleOk = 0, sampleFail = 0;
const sampleBad = [];
for (const p of sample) {
  try {
    await page.goto(BASE + p.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const info = await page.evaluate(() => ({
      title: document.title,
      h2: document.querySelector('.product-custom h2')?.textContent?.trim() || '',
      hasAddBtn: !!document.querySelector('button[title="Thêm vào giỏ hàng"]'),
      hasDetailTab: /Chi Tiết Sản Phẩm/.test(document.body.innerText),
      outOfStock: /Tạm thời hết hàng|Hết hàng/i.test(document.body.innerText),
      brokenImgs: [...document.querySelectorAll('img')].filter((i) => i.complete && i.naturalWidth === 0 && i.getAttribute('src')).length,
    }));
    const nameOk = info.h2.indexOf(String(p.name).slice(0, 18)) > -1 || info.title.indexOf(String(p.name).slice(0, 18)) > -1;
    // 缺货商品原站本来就不渲染加购按钮
    const btnOk = info.hasAddBtn || info.outOfStock;
    if (nameOk && btnOk && info.brokenImgs === 0) sampleOk++;
    else { sampleFail++; if (sampleBad.length < 5) sampleBad.push({ url: p.url, ...info, expected: p.name.slice(0, 30) }); }
  } catch (e) {
    sampleFail++;
    if (sampleBad.length < 5) sampleBad.push({ url: p.url, error: String(e).slice(0, 40) });
  }
}
ok(`随机 ${sampleSize} 个商品页内容正确`, sampleFail === 0, `${sampleOk} 通过 / ${sampleFail} 失败`);
sampleBad.forEach((b) => console.log(`    ${JSON.stringify(b)}`));

/* ---------------- 3. 分类页抽样 ---------------- */
console.log('\n=== 3. 分类页抽样 ===');
const cats = JSON.parse(await readFile('public/data/catalog.json', 'utf8')).categoriesFlat;
const catSample = [];
const cstep = Math.floor(cats.length / 10);
for (let i = 0; i < cats.length && catSample.length < 10; i += cstep) catSample.push(cats[i]);

let catOk = 0, catFail = 0;
for (const c of catSample) {
  try {
    const res = await page.goto(BASE + c.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const info = await page.evaluate(() => ({
      cards: document.querySelectorAll('a[href*="/vi-nsg/product/"]').length,
      emptySpans: [...document.querySelectorAll('a[href*="/vi-nsg/product/"] span')].filter((s) => !String(getComputedStyle(s).backgroundImage || '').includes('url(')).length,
    }));
    if (res.status() === 200 && info.cards > 0 && info.emptySpans === 0) catOk++;
    else catFail++;
  } catch { catFail++; }
}
ok('分类页 10 个抽样（有商品卡 + 图片已填）', catFail === 0, `${catOk}/10`);

/* ---------------- 4. 关键页面 ---------------- */
console.log('\n=== 4. 关键页面 ===');
for (const [label, path, expectStatus] of [
  ['首页', '/', 200],
  ['购物车', '/cart', 200],
  ['结账', '/checkout', 200],
  ['搜索', '/search?q=nam', 200],
  ['登录', '/login', 200],
  ['成功页', '/order/LTM-TEST', 200],
  ['专题页', '/vi-nsg/tp5/sinh-nhat-lotte', 200],
  ['静态页', '/vi-nsg/about-us', 200],
  ['bp connector', '/bp/connector.js', 200],
  ['bp config', '/bp/config.json', 200],
  ['商品图', '/media/catalog/product/cache/300x300/9/4/9415007055648-1.jpg.webp', 200],
]) {
  const res = await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => null);
  ok(`${label.padEnd(14)} ${path}`, res && res.status() === expectStatus, res ? `status=${res.status()}` : 'ERR');
}

/* ---------------- 5. 接口 ---------------- */
console.log('\n=== 5. 接口 ===');
const cartRes = await page.goto(BASE + '/api/cart', { waitUntil: 'domcontentloaded' }).catch(() => null);
const cartJson = await cartRes.json().catch(() => null);
ok('/api/cart 结构正确', cartJson && 'order_number' in cartJson && 'total_amount' in cartJson && cartJson.currency === 'VND', JSON.stringify(cartJson).slice(0, 90));

const postRes = await fetch(BASE + '/api/checkout', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    order_number: 'LTM-SELFTEST-' + Date.now().toString(36).toUpperCase(),
    amount: 10000, currency: 'VND', locale: 'vi',
    customer: { name: 'Test', email: 't@e.com', phone: '0900', addr: 'x' },
  }),
}).then((r) => r.json()).catch(() => null);
ok('/api/checkout 返回 ok:true + 单号复用', postRes && postRes.ok === true && String(postRes.order_number).startsWith('LTM-SELFTEST-'), JSON.stringify(postRes).slice(0, 90));

/* ---------------- 6. CSP ---------------- */
console.log('\n=== 6. 响应头 ===');
const head = await fetch(BASE + '/checkout', { method: 'HEAD' });
const csp = head.headers.get('content-security-policy') || '';
ok("frame-src 含面板域名", /frame-src[^;]*https:\/\/annangourmet\.makeup/.test(csp));
ok("connect-src 含 wss://", /connect-src[^;]*wss:\/\//.test(csp));
ok("script-src 'unsafe-inline'", /script-src[^;]*'unsafe-inline'/.test(csp));
ok('无 X-Frame-Options', !head.headers.get('x-frame-options'));

await browser.close();

const failed = results.filter((r) => !r.p);
console.log(`\n=== ${results.length - failed.length}/${results.length} passed ===`);
if (failed.length) {
  console.log('FAILED:');
  failed.forEach((f) => console.log('  ' + f.n));
  process.exitCode = 1;
}
