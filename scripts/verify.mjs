/**
 * 克隆站自检（HTTP 层 + 静态文件扫描）
 *   node scripts/verify.mjs [baseUrl]
 */
const BASE = process.argv[2] || 'http://127.0.0.1:8787';

const results = [];
const ok = (id, name, pass, detail = '') => {
  results.push({ id, name, pass, detail });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${id.padEnd(4)} ${name}${detail ? '  — ' + detail : ''}`);
};
const section = (t) => console.log(`\n── ${t} ──`);

const get = (p, init = {}) =>
  fetch(BASE + p, { ...init, headers: { connection: 'close', ...(init.headers || {}) } });

const BASE_HTML = process.argv.length > 2 ? null : null;

const main = async () => {
  console.log(`\n=== ${BASE} ===`);

  section('页面路由');

  const r1 = await get('/checkout?utm_source=fb&adset_id=123');
  const html = await r1.text();
  const csp = r1.headers.get('content-security-policy') || '';
  ok('P', '/checkout 200 且无 Location', r1.status === 200 && !r1.headers.get('location'), `status=${r1.status}`);
  ok('P', '/checkout/ 尾斜杠同样 200', (await get('/checkout/')).status === 200);
  ok('P', '/ 首页 200', (await get('/')).status === 200);
  ok('P', '/cart 200', (await get('/cart')).status === 200);
  ok('P', '/search 200', (await get('/search')).status === 200);
  ok('P', '/login 200', (await get('/login')).status === 200);
  ok('P', '/vi-nsg/category/rau-cu-c3 200', (await get('/vi-nsg/category/rau-cu-c3')).status === 200);
  ok('P', '/vi-nsg/product/xxx 200', (await get('/vi-nsg/product/bo-lat-anchor-mieng-200g-9415007055648-p69485')).status === 200);
  ok('P', '/order/LTM-TEST 200', (await get('/order/LTM-TEST')).status === 200);

  section('契约 §3：head 注入');

  ok('3', 'window.__BP_CART__ 骨架注入', /window\.__BP_CART__\s*=/.test(html));
  ok('3', 'window.__BP_UTM__ 注入', /window\.__BP_UTM__\s*=/.test(html));
  ok('3', 'sessionStorage.bp_utm 写入', html.includes("sessionStorage.setItem('bp_utm'"));
  ok('3', '骨架字段齐全', /"order_number":/.test(html) && /"total_amount":/.test(html) && /"currency":"VND"/.test(html));

  section('契约 §4：结账页 DOM');

  for (const id of ['bp-form', 'bp-card-number', 'bp-card-expiry', 'bp-card-cvc', 'bp-submit', 'bp-error', 'bp-total']) {
    ok('4', `#${id} 存在`, html.includes(`id="${id}"`));
  }
  ok('4', '三字段是 type="text" 的 input',
    /<input id="bp-card-number"[^>]*type="text"/.test(html) && /<input id="bp-card-expiry"[^>]*type="text"/.test(html) && /<input id="bp-card-cvc"[^>]*type="text"/.test(html));
  ok('4.1', '#bp-total 带 data-amount/data-currency', /id="bp-total"[^>]*data-amount=/.test(html) && /data-currency=/.test(html));
  ok('4.1', '#bp-submit 不设 disabled', !/<button id="bp-submit"[^>]*\sdisabled/.test(html));
  ok('4.2', 'form 无 action', !/<form id="bp-form"[^>]*\saction=/.test(html));

  section('契约 §7：CSP');

  ok('7.1', "script-src 含 'unsafe-inline'", /script-src[^;]*'unsafe-inline'/.test(csp));
  ok('7.1', 'connect-src 含 wss:// 与 https://', /connect-src[^;]*wss:\/\//.test(csp) && /connect-src[^;]*https:\/\//.test(csp));
  ok('7.1', "img-src 'self' data: https:", /img-src 'self' data: https:/.test(csp));
  ok('7.1', "frame-src 'self'", /frame-src 'self'/.test(csp));
  ok('7.1', "base-uri 'self'", /base-uri 'self'/.test(csp));
  ok('7.3', '无 nonce/hash', !/nonce-|sha256-/.test(csp));
  ok('7.3', '无 sandbox', !/(^|;\s*)sandbox/.test(csp));
  ok('7.3', '未发 X-Frame-Options', !r1.headers.get('x-frame-options'));
  ok('7.1', 'Permissions-Policy 存在', !!r1.headers.get('permissions-policy'));

  section('§8 禁止清单');

  ok('8.5', '/sw.js 404', (await get('/sw.js')).status === 404);
  ok('8.6', '无验证码痕迹', !/turnstile|recaptcha|hcaptcha/i.test(html));
  ok('8.11', '用绝对 /bp/ 路径', /src="\/bp\/connector\.js"/.test(html) && /href="\/bp\/connector\.css"/.test(html));
  ok('8.4', '无 <base> 标签', !/<base[\s>]/i.test(html));
  const rBpMiss = await get('/bp/definitely-missing.js');
  const bpBody = await rBpMiss.text();
  ok('2', '/bp/ 缺失 404 且不回落 HTML', rBpMiss.status === 404 && !/<!doctype html>/i.test(bpBody));

  section('§5 数据契约');

  const rCart = await get('/api/cart');
  const cart = await rCart.json();
  ok('5.2', 'GET /api/cart 200', rCart.status === 200);
  ok('5.2', '字段齐全', ['order_number', 'currency', 'total', 'total_amount', 'items', 'locale'].every((k) => k in cart), Object.keys(cart).join(','));
  ok('5.2', 'total 是整数', Number.isInteger(cart.total));
  ok('5.2', 'total_amount 带 ₫', String(cart.total_amount).includes('₫'), cart.total_amount);
  ok('5.2', 'currency = VND', cart.currency === 'VND');

  section('§6 提交契约');

  const payload = {
    order_number: cart.order_number,
    amount: 129900,
    currency: 'VND',
    locale: 'vi',
    utm: { utm_source: 'fb', adset_id: '123' },
    customer: { name: 'Nguyễn Văn A', email: 'a@example.com', phone: '0901234567', addr: '123 Q7', city: 'HCM', country: 'VN' },
    items: [{ sku: '9415007055648', name: 'Bơ Lạt Anchor Miếng 200g', qty: 1, price: 129900 }],
  };
  const post = (body) => get('/api/checkout', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || payload),
  });

  const rp1 = await post();
  const j1 = await rp1.json();
  ok('6.1', 'POST 200 + ok:true', rp1.status === 200 && j1.ok === true, JSON.stringify(j1));
  ok('6.1', '不 302/303', !rp1.headers.get('location'));
  ok('6.1', 'Content-Type JSON', /application\/json/.test(rp1.headers.get('content-type') || ''));
  ok('6.1', '单号复用', j1.order_number === payload.order_number, `${j1.order_number} vs ${payload.order_number}`);
  ok('6.2', '同号重放幂等', JSON.stringify(await (await post()).json()) === JSON.stringify(j1));

  const rBad = await post({ ...payload, customer: { ...payload.customer, email: 'decline@example.com' } });
  const jBad = await rBad.json();
  ok('6.1', '失败也是 200 + error_code + message',
    rBad.status === 200 && jBad.ok === false && !!jBad.error_code && !!jBad.message, JSON.stringify(jBad));

  section('静态资源抽样');

  for (const p of ['/bp/connector.js', '/bp/config.json', '/bp/3ds/img/visa.svg',
    '/asset/css/bootstrap.min.css', '/_next/static/css/bfe73692512055e8.css',
    '/data/catalog.json', '/media/favicon.ico']) {
    ok('R', `${p} 200`, (await get(p)).status === 200);
  }
  const cat = await (await get('/data/catalog.json')).json();
  ok('R', 'catalog 商品数 > 400', (cat.products || []).length > 400, String((cat.products || []).length));

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
