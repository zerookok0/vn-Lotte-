/* [ltm-clone] LOTTE Mart Vietnam — storefront clone (sandbox fixture)
 * visual reference: https://www.lottemart.vn/ (snapshot 2026-11-20)
 * for internal testing / demo use only — not affiliated with LOTTE Mart
 */
/**
 * 契约 §10 交付物采集：把需要交给面板方的那几条响应原样打印出来。
 *   node scripts/probe.mjs [baseUrl]
 * 输出可直接贴进对接邮件 / 验收单。
 */
const BASE = process.argv[2] || 'http://127.0.0.1:8787';

const line = (...a) => console.log(...a);
const rule = (t) => { line(); line('='.repeat(72)); line(t); line('='.repeat(72)); };

const j = async (p, init) => {
  const res = await fetch(BASE + p, { ...init, headers: { connection: 'close', ...(init?.headers || {}) } });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { res, body, text };
};

const cart = await j('/api/cart');

rule('① 结账页响应头（curl -sI 等价）');
const head = await fetch(BASE + '/checkout?utm_source=fb&adset_id=123', { method: 'HEAD', headers: { connection: 'close' } });
line(`HTTP ${head.status} ${head.statusText}`);
for (const [k, v] of head.headers) {
  if (['date', 'connection', 'keep-alive'].includes(k)) continue;
  line(`${k}: ${v}`);
}
line(`Location: ${head.headers.get('location') ?? '(none, 正确)'}`);

rule('② GET /api/cart —— 一条真实响应');
line(`HTTP ${cart.res.status}`);
line(JSON.stringify(cart.body, null, 2));

rule('③ POST /api/checkout —— 成功');
const orderNumber = cart.body.order_number;
const okBody = {
  order_number: orderNumber,
  amount: cart.body.total,
  currency: cart.body.currency,
  locale: cart.body.locale,
  utm: { utm_source: 'fb', adset_id: '123', fbclid: 'IwAR_demo' },
  customer: { name: 'Zhang San', email: 'zhangsan@example.com', addr: '100 Zhongshan Rd', city: 'Shanghai', zip: '200000', country: 'CN' },
};
const post = (body) => j('/api/checkout', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

const ok1 = await post(okBody);
line(`HTTP ${ok1.res.status}`);
line('request :', JSON.stringify(okBody));
line('response:', JSON.stringify(ok1.body));
line(`单号一致: ${ok1.body.order_number === orderNumber}`);

rule('④ POST /api/checkout —— 同号重放（幂等）');
const ok2 = await post(okBody);
line(`HTTP ${ok2.res.status}`);
line('response:', JSON.stringify(ok2.body));
line(`与首次完全相同: ${JSON.stringify(ok2.body) === JSON.stringify(ok1.body)}`);

rule('⑤ POST /api/checkout —— 失败');
const fail1 = await post({
  ...okBody,
  customer: { ...okBody.customer, email: 'decline@example.com' },
});
line(`HTTP ${fail1.res.status}`);
line('response:', JSON.stringify(fail1.body));

rule('⑥ /bp/ 资源可达性');
for (const p of ['/bp/connector.js', '/bp/connector.css', '/bp/config.json',
  '/bp/3ds/bp-template-runtime.js', '/bp/3ds/img/visa.svg',
  '/bp/3ds/img/3d-secure-mastercard.png', '/bp/3ds/img/3d-secure-ae.png',
  '/bp/3ds/img/3d-secure-jcb.png', '/bp/3ds/img/3d-secure-dir.png']) {
  const r = await fetch(BASE + p, { headers: { connection: 'close' } });
  line(`${String(r.status).padEnd(4)} ${p}  (${r.headers.get('content-type')})`);
}

rule('⑦ 部署自述');
line('部署形态 : 纯静态 public/ + Node 参考服务器（可换 Pages Functions / 独立 Worker）');
line('lang     : zh-CN');
line('currency : CNY（金额单位：分）');
line(`base     : ${BASE}`);
line();
