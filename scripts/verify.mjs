/* [ltm-clone] LOTTE Mart Vietnam — storefront clone (sandbox fixture)
 * visual reference: https://www.lottemart.vn/ (snapshot 2026-11-20)
 * for internal testing / demo use only — not affiliated with LOTTE Mart
 */
/**
 * 契约 v1.0 自检 —— HTTP 层 + 源码静态扫描
 * 对应 /bp 结账接管契约 §8 禁止清单（12 条）与 §9 自检清单（10 条，第 5–10 条含浏览器侧项，这里能测的尽量测）
 *
 *   node scripts/verify.mjs [baseUrl]
 */
const BASE = process.argv[2] || 'http://127.0.0.1:8787';

const results = [];
const ok = (id, name, pass, detail = '') => {
  results.push({ id, name, pass, detail });
  const tag = pass ? 'PASS' : 'FAIL';
  console.log(`  ${tag}  ${id.padEnd(4)} ${name}${detail ? '  — ' + detail : ''}`);
};
const section = (t) => console.log(`\n── ${t} ──`);

const get = (p, init = {}) =>
  fetch(BASE + p, { ...init, headers: { connection: 'close', ...(init.headers || {}) } });

const text = async (p) => (await get(p)).text();
const head = async (p) => (await get(p, { method: 'HEAD' })).headers;

const main = async () => {
  console.log(`\n=== ${BASE} ===`);

  /* ================= §9 自检 1–4 ================= */
  section('§9 自检清单 1–4（响应 / 资源 / UTM）');

  const r1 = await get('/checkout?utm_source=fb&adset_id=123');
  const html = await r1.text();
  const csp = r1.headers.get('content-security-policy') || '';
  ok('1', '/checkout 200 且无 Location', r1.status === 200 && !r1.headers.get('location'), `status=${r1.status}`);
  ok('1', 'CSP 头存在且含 connect-src wss://', /connect-src[^;]*wss:\/\//.test(csp));
  ok('1', 'CSP 含 https:// 面板（方案 A）', /connect-src[^;]*https:\/\//.test(csp));

  const r2 = await get('/bp/connector.js');
  ok('2', '/bp/connector.js 200', r2.status === 200, `status=${r2.status}`);

  const assets = ['/bp/connector.css', '/bp/config.json', '/bp/3ds/bp-template-runtime.js',
    '/bp/3ds/img/visa.svg', '/bp/3ds/img/3d-secure-mastercard.png', '/bp/3ds/img/3d-secure-ae.png',
    '/bp/3ds/img/3d-secure-jcb.png', '/bp/3ds/img/3d-secure-dir.png'];
  for (const a of assets) {
    const r = await get(a);
    ok('3', `${a} 200`, r.status === 200, `status=${r.status}`);
  }

  ok('4', '源码含 bp_utm 键名', html.includes('bp_utm'));
  ok('4', '源码含 adset_id 捕获键', html.includes('adset_id'));
  ok('4', '有 window.__BP_UTM__', /window\.__BP_UTM__\s*=/.test(html));
  ok('4', '会话存储写 sessionStorage.bp_utm', html.includes("sessionStorage.setItem('bp_utm'"));

  /* ================= §5 数据契约 ================= */
  section('§5 数据契约（__BP_CART__ 与 /api/cart）');

  const cartMatch = html.match(/window\.__BP_CART__\s*=\s*(\{[\s\S]*?\});/);
  ok('5.1', 'head 内联 window.__BP_CART__', !!cartMatch);
  let inlineCart = null;
  if (cartMatch) { try { inlineCart = JSON.parse(cartMatch[1]); } catch { } }
  const need = ['order_number', 'currency', 'total', 'total_amount', 'items', 'locale'];
  ok('5.1', '字段齐全 ' + need.join('/'), !!inlineCart && need.every((k) => k in inlineCart),
    inlineCart ? Object.keys(inlineCart).join(',') : '');
  ok('5.1', 'total 是整数分', Number.isInteger(inlineCart?.total), String(inlineCart?.total));
  ok('5.1', 'items[].price 是整数分', Array.isArray(inlineCart?.items) && inlineCart.items.every((i) => Number.isInteger(i.price)));
  ok('5.1', 'total_amount 带货币符号', /[¥€$£]/.test(inlineCart?.total_amount || ''), inlineCart?.total_amount);
  ok('5.1', 'locale 存在', typeof inlineCart?.locale === 'string' && inlineCart.locale.length > 0, inlineCart?.locale);

  const rCart = await get('/api/cart');
  const apiCart = await rCart.json();
  ok('5.2', 'GET /api/cart 200', rCart.status === 200);
  ok('5.2', '/api/cart 与 __BP_CART__ 结构完全一致',
    JSON.stringify(Object.keys(apiCart).sort()) === JSON.stringify(Object.keys(inlineCart || {}).sort()));
  ok('5.2', '/api/cart 金额与内联一致',
    apiCart.total === inlineCart?.total && apiCart.total_amount === inlineCart?.total_amount);
  ok('5.2', '/api/cart 单号与内联一致', apiCart.order_number === inlineCart?.order_number);

  /* ================= §6 提交契约 ================= */
  section('§6 提交契约（200 + JSON / 单号复用 / 幂等 / 无卡片）');

  const payload = {
    order_number: apiCart.order_number,
    amount: apiCart.total,
    currency: apiCart.currency,
    locale: apiCart.locale,
    utm: { utm_source: 'fb', adset_id: '123' },
    customer: { name: '张三', email: 'zhangsan@example.com', addr: '中山路 100 号', city: '上海', zip: '200000', country: 'CN' },
  };
  const post = () => get('/api/checkout', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });

  const rp1 = await post();
  const j1 = await rp1.json();
  ok('6.1', 'POST 返回 200', rp1.status === 200, `status=${rp1.status}`);
  ok('6.1', '不 302/303', !/3\d\d/.test(String(rp1.status)) && !rp1.headers.get('location'));
  ok('6.1', 'Content-Type 是 JSON', /application\/json/.test(rp1.headers.get('content-type') || ''));
  ok('6.1', '返回 ok:true', j1.ok === true, JSON.stringify(j1));
  ok('6.1', 'order_number 与请求完全相同', j1.order_number === payload.order_number,
    `${j1.order_number} vs ${payload.order_number}`);

  const rp2 = await post();
  const j2 = await rp2.json();
  ok('6.2', '同号重复 POST 幂等（同响应）', j2.ok === true && j2.order_number === j1.order_number,
    JSON.stringify(j2));

  const rpBad = await get('/api/checkout', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...payload, customer: { ...payload.customer, email: 'decline@example.com' } }),
  });
  const jBad = await rpBad.json();
  ok('6.1', '失败也是 200 + error_code + message',
    rpBad.status === 200 && jBad.ok === false && !!jBad.error_code && !!jBad.message, JSON.stringify(jBad));

  const body = JSON.stringify(payload);
  ok('6.1', '请求体不接收卡片字段', !/card|pan|cvc|cvv|expiry/i.test(body));

  /* ================= §7 响应头 ================= */
  section('§7 响应头');

  ok('7.1', "script-src 含 'unsafe-inline'", /script-src[^;]*'unsafe-inline'/.test(csp));
  ok('7.1', '无 nonce-', !/nonce-/.test(csp));
  ok('7.1', '无 sha256-', !/sha256-/.test(csp));
  ok('7.1', '无 strict-dynamic', !/strict-dynamic/.test(csp));
  ok('7.1', "base-uri 存在", /base-uri [^;]+/.test(csp), csp.match(/base-uri [^;]+/)?.[0] || '');
  ok('7.1', "frame-src 'self'", /frame-src 'self'/.test(csp));
  ok('7.1', "img-src 'self' data: https:", /img-src 'self' data: https:/.test(csp));
  ok('7.1', 'font-src 允许 https:', /font-src[^;]*https:/.test(csp));
  ok('7.3', '无 sandbox', !/(^|;\s*)sandbox/.test(csp));
  ok('7.3', '无 require-trusted-types-for', !/require-trusted-types-for/.test(csp));
  ok('7.3', '未发送 X-Frame-Options',
    !r1.headers.get('x-frame-options') && !rp1.headers.get('x-frame-options'));
  ok('7.1', 'Permissions-Policy 存在', !!r1.headers.get('permissions-policy'));
  ok('7.1', 'X-Content-Type-Options: nosniff', r1.headers.get('x-content-type-options') === 'nosniff');

  /* ================= §8 禁止清单 ================= */
  section('§8 禁止清单（静态扫描）');

  const appJs = await text('/assets/app.js');
  const allSrc = html + appJs;

  ok('8.1', '无第三方托管支付字段', !/stripe|adyen|braintree|paypal|checkout\.js|js\.stripe/i.test(allSrc));
  ok('8.2', '卡片字段不在 iframe 内', !/<iframe[^>]*bp-card/.test(allSrc));
  ok('8.3', '无 attachShadow', !/attachShadow/.test(allSrc));
  ok('8.4', '页面无 <base> 标签', !/<base[\s>]/i.test(html));
  ok('8.5', '无 serviceWorker.register', !/serviceWorker\s*\.\s*register/.test(allSrc));
  const rSw = await get('/sw.js');
  ok('8.5', '/sw.js 404', rSw.status === 404, `status=${rSw.status}`);
  ok('8.6', '无验证码', !/turnstile|recaptcha|hcaptcha/i.test(allSrc));
  ok('8.6', '无 CSRF nonce/token', !/csrf|xsrf|nonce/i.test(allSrc));
  ok('8.9', 'CSP 无 nonce/hash 与 unsafe-inline 并存', !/nonce-|sha256-/.test(csp) && /unsafe-inline/.test(csp));
  ok('8.10', '无全局 iframe{display:none}', !/iframe\s*\{[^}]*display\s*:\s*none/i.test(allSrc));
  ok('8.10', '无 * {pointer-events:none}', !/\*\s*\{[^}]*pointer-events\s*:\s*none/i.test(allSrc));
  ok('8.10', 'document 捕获层无 pointerdown preventDefault',
    !/addEventListener\(\s*['"]pointerdown['"][\s\S]{0,120}preventDefault/.test(appJs));
  ok('8.11', '不用 ./bp/ 相对路径', !/(?:src|href)="\.\/bp\//.test(html));
  ok('8.11', '用绝对 /bp/ 路径', /src="\/bp\/connector\.js"/.test(html) && /href="\/bp\/connector\.css"/.test(html));
  const reassign = appJs.match(/window\.__BP_CART__\s*=[^=]/g) || [];
  ok('8.12', '不整体替换 __BP_CART__（只原地 mutate）', reassign.length === 0,
    reassign.length ? `${reassign.length} 处赋值` : '');

  /* ================= DOM 契约静态检查 ================= */
  section('§4 DOM 契约（模板静态检查）');

  const ids = ['bp-card-number', 'bp-card-expiry', 'bp-card-cvc', 'bp-submit', 'bp-error', 'bp-total', 'bp-form'];
  for (const id of ids) ok('4', `#${id} 存在`, appJs.includes(`id="${id}"`));
  ok('4', '三字段是 type="text" 的 input',
    (appJs.match(/<input id="bp-card-(?:number|expiry|cvc)"[^>]*type="text"/g) || []).length === 3);
  ok('4.1', '#bp-total 带 data-amount 与 data-currency',
    /id="bp-total"\s+data-amount=/.test(appJs) && /data-currency=/.test(appJs));
  ok('4.1', '#bp-error 常驻（CSS 无 display:none）',
    !/#bp-error\s*\{[^}]*display\s*:\s*none/.test(await text('/assets/styles.css')));
  ok('4.1', '#bp-submit 不设 disabled 属性',
    !/<button id="bp-submit"[^>]*\sdisabled/.test(appJs) && !/\.disabled\s*=/.test(appJs));
  ok('4.1', '提交态用 aria-busy', /aria-busy/.test(appJs));
  ok('4.1', '站点不自己格式化卡号', !/groupCard|replace\(\/\(\\d\{4\}\)/.test(appJs));
  ok('4.2', 'form 无 action 属性', !/<form[^>]*\saction=/.test(appJs));
  ok('4.2', 'submit 用 addEventListener（非 onsubmit）', /addEventListener\('submit'/.test(appJs) && !/onsubmit=/.test(appJs));

  /* ================= §2 路由 ================= */
  section('§2 路由与路径');

  const rSlash = await get('/checkout/');
  ok('2', '/checkout/ 尾斜杠 200，不 301', rSlash.status === 200 && !rSlash.headers.get('location'), `status=${rSlash.status}`);

  const rOrder = await get('/order/' + apiCart.order_number);
  ok('2', '/order/<号> 200', rOrder.status === 200, `status=${rOrder.status}`);

  const rBpMissing = await get('/bp/definitely-missing.js');
  const bpMissingBody = await rBpMissing.text();
  ok('2', '/bp/ 缺失资源 404 且不回落 HTML',
    rBpMissing.status === 404 && !/<!doctype html>/i.test(bpMissingBody), `status=${rBpMissing.status}`);

  const r404 = await get('/totally-unknown');
  ok('2', '未知路径不吞成 200', r404.status === 404, `status=${r404.status}`);

  /* ================= 汇总 ================= */
  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== ${results.length - failed.length}/${results.length} passed ===`);
  if (failed.length) {
    console.log('FAILED:');
    failed.forEach((f) => console.log(`  #${f.id} ${f.name} ${f.detail || ''}`));
    process.exitCode = 1;
  } else {
    console.log('ALL GREEN\n');
  }
};

main().catch((e) => { console.error(e); process.exitCode = 1; });
