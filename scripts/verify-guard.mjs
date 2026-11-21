/**
 * 验证 20261121 新包的「提交守卫」行为：
 * 点提交后不能自己跳转，必须挂起等面板指令（allow_direct=false）。
 *   node scripts/verify-guard.mjs
 */
import { chromium } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:8787';

const results = [];
const ok = (n, p, d = '') => { results.push({ n, p }); console.log(`  ${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
const page = await ctx.newPage();
const reqs = [];
page.on('request', (r) => { if (/\/api\/checkout/.test(r.url())) reqs.push(r.url()); });

await page.goto(BASE + '/?utm_source=fb', { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(900);
await page.evaluate(() => document.querySelector('.btn-cart').click());
await page.waitForTimeout(500);

await page.goto(BASE + '/checkout', { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(2000);

const modeBefore = await page.evaluate(() => window.BPConnector?.mode?.());
console.log('  mode(before):', JSON.stringify(modeBefore));

await page.fill('#t-name', 'Nguyễn Văn A');
await page.fill('#t-email', 'vana@example.com');
await page.fill('#t-phone', '0901234567');
await page.fill('#t-addr', '123 Nguyễn Hữu Thọ');
await page.fill('#bp-card-number', '4242424242424242');
await page.fill('#bp-card-expiry', '12/29');
await page.fill('#bp-card-cvc', '123');
await page.waitForTimeout(300);

const reqBefore = reqs.length;
await page.click('#bp-submit');
await page.waitForTimeout(4000);

const after = await page.evaluate(() => ({
  path: location.pathname,
  err: document.getElementById('bp-error')?.textContent,
  ariaBusy: document.getElementById('bp-submit')?.getAttribute('aria-busy'),
  disabled: document.getElementById('bp-submit')?.disabled,
  mode: window.BPConnector?.mode?.(),
}));

ok('点提交后停留在结账页（不自动跳转）', after.path === '/checkout', after.path);
ok('按钮 aria-busy=true', after.ariaBusy === 'true', String(after.ariaBusy));
ok('按钮没有 disabled（可聚焦）', after.disabled === false, String(after.disabled));
ok('页面显示等待/处理提示', !!String(after.err || '').trim(), String(after.err).slice(0, 50));
ok('4 秒内没有打 /api/checkout（等面板）', reqs.length === reqBefore, `新增请求 ${reqs.length - reqBefore}`);
ok('mode().awaiting = true', after.mode?.awaiting === true, JSON.stringify(after.mode));

console.log('\n  mode(after):', JSON.stringify(after.mode));

await browser.close();
const failed = results.filter((r) => !r.p);
console.log(`\n=== ${results.length - failed.length}/${results.length} passed ===`);
if (failed.length) process.exitCode = 1;
