/**
 * 验证 20261121 新包（pixel + spinner + veil）
 *   node scripts/verify-bp-20261121.mjs [baseUrl]
 */
import { chromium } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.argv[2] || 'https://vn-lotte.mating.workers.dev';

const results = [];
const ok = (n, p, d = '') => { results.push({ n, p }); console.log(`  ${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };

/* --- HTTP --- */
const cjs = await fetch(BASE + '/bp/connector.js');
const cjsText = await cjs.text();
ok('connector.js 是新版（>70KB）', cjs.status === 200 && cjsText.length > 70000, `${cjsText.length} B`);
ok('含 pixel 实现', /firePurchase|pixel_enabled/.test(cjsText));
ok('含 bp-busy / bp-veil 逻辑', /bp-busy/.test(cjsText) && /bp-veil/.test(cjsText));

const cfg = await (await fetch(BASE + '/bp/config.json')).json();
ok('config 有 pixel_enabled', cfg.pixel_enabled === true, String(cfg.pixel_enabled));
ok('config 有 pixel_platforms', Array.isArray(cfg.pixel_platforms), JSON.stringify(cfg.pixel_platforms));
ok('config guard_mode=always', cfg.guard_mode === 'always');
ok('config allow_direct=false', cfg.allow_direct === false);

const coHtml = await (await fetch(BASE + '/checkout')).text();
ok('结账页有 .bp-card-fields 容器', coHtml.includes('bp-card-fields'));
ok('结账页有 #bp-submit', coHtml.includes('id="bp-submit"'));

const ccss = await (await fetch(BASE + '/bp/connector.css')).text();
ok('connector.css 有 spinner 样式', /#bp-submit\.bp-busy::after/.test(ccss));
ok('connector.css 有 veil 样式', /\.bp-card-fields\.bp-veil/.test(ccss));

/* --- 浏览器行为 --- */
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 100)));

await page.goto(BASE + '/?utm_source=fb', { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(900);
await page.evaluate(() => document.querySelector('.btn-cart')?.click());
await page.waitForTimeout(500);

await page.goto(BASE + '/checkout', { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(1800);

const init = await page.evaluate(() => ({
  connector: !!window.BPConnector,
  version: window.BPConnector?.version,
  hasPixelApi: typeof window.BPConnector?.pixel === 'object',
  pantryKeys: window.BPConnector?.pixel ? Object.keys(window.BPConnector.pixel) : [],
  mode: window.BPConnector?.mode?.(),
}));
ok('BPConnector 已加载', init.connector, `version=${init.version}`);
ok('暴露 BPConnector.pixel', init.hasPixelApi, init.pantryKeys.join(','));

/* 填表 + 提交，观察 bp-busy / bp-veil */
await page.fill('#t-name', 'Nguyễn Văn A');
await page.fill('#t-email', 'vana@example.com');
await page.fill('#t-phone', '0901234567');
await page.fill('#t-addr', '123 Nguyễn Hữu Thọ');
await page.fill('#bp-card-number', '4242424242424242');
await page.fill('#bp-card-expiry', '12/29');
await page.fill('#bp-card-cvc', '123');
await page.waitForTimeout(300);
await page.click('#bp-submit');
await page.waitForTimeout(1200);

const busy = await page.evaluate(() => ({
  submitClass: document.getElementById('bp-submit')?.className || '',
  ariaBusy: document.getElementById('bp-submit')?.getAttribute('aria-busy'),
  veil: !!document.querySelector('.bp-card-fields.bp-veil'),
  veilOpacity: (() => {
    const el = document.querySelector('.bp-card-fields');
    return el ? getComputedStyle(el).opacity : null;
  })(),
  pixel: window.BPConnector?.pixel?.state ? window.BPConnector.pixel.state() : null,
  err: document.getElementById('bp-error')?.textContent || '',
}));

ok('提交后按钮带 bp-busy', /bp-busy/.test(busy.submitClass), busy.submitClass);
ok('卡片区带 bp-veil（淡化）', busy.veil === true, `opacity=${busy.veilOpacity}`);
ok('pixel 状态可读', busy.pixel !== null, JSON.stringify(busy.pixel).slice(0, 110));
console.log('    pixel.state:', JSON.stringify(busy.pixel));
console.log('    mode:', JSON.stringify(init.mode));

ok('无 JS 异常', errs.length === 0, errs[0] || '');

await browser.close();
const failed = results.filter((r) => !r.p);
console.log(`\n=== ${results.length - failed.length}/${results.length} passed ===`);
if (failed.length) { failed.forEach((f) => console.log('  ✗ ' + f.n)); process.exitCode = 1; }
