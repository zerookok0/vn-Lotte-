/* [ltm-clone] LOTTE Mart Vietnam — storefront clone (sandbox fixture)
 * R2-backed Worker：静态文件从 R2 取，两个接口在 Worker 里实现。
 */

const PANEL_DOMAIN = 'annangourmet.makeup';

/* 契约 §7.1：frame-src 必须包含面板域名（验证屏是面板托管页） */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data: https:",
  `connect-src 'self' https://${PANEL_DOMAIN} wss://${PANEL_DOMAIN}`,
  `frame-src 'self' https://${PANEL_DOMAIN}`,
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
  '.mp4': 'video/mp4',
};

const BASE_HEADERS = {
  'content-security-policy': CSP,
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'payment=(self), clipboard-write=(self)',
};

const CURRENCY = 'VND';
const LOCALE = 'vi';
const fmtVnd = (n) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(n || 0) + ' ₫';

const DONE = new Map();

const json = (obj) => new Response(JSON.stringify(obj), {
  headers: { ...BASE_HEADERS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

function readCookie(header, name) {
  const m = String(header || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : '';
}

/* ---------------- 路由：URL -> R2 key ---------------- */
function resolveKey(pathname) {
  let p = pathname;
  if (p === '/' || p === '') return 'index.html';

  // 固定页面
  const fixed = {
    '/cart': 'cart.html',
    '/checkout': 'checkout.html',
    '/search': 'search.html',
    '/login': 'login.html',
    '/vi-nsg/cart': 'cart.html',
    '/vi-nsg/checkout': 'checkout.html',
    '/vi-nsg/login': 'login.html',
    '/vi-nsg/search': 'search.html',
  };
  if (fixed[p]) return fixed[p];
  if (p.startsWith('/order/')) return 'order.html';

  let key = p.replace(/^\/+/, '');

  // 商品 / 分类：<slug>.html
  if (/^vi-nsg\/product\/[^/]+$/.test(key) || /^vi-nsg\/category\/[^/]+$/.test(key)) {
    return key + '.html';
  }
  // /vi-nsg/about-us -> vi-nsg/about-us.html（专题页/静态页）
  if (/^vi-nsg\/[^/]+$/.test(key) && !/\.[a-z0-9]+$/i.test(key)) {
    return key + '.html';
  }
  if (/^vi-nsg\/(tp\d+)\/[^/]+$/.test(key)) {
    return key + '.html';
  }
  return key;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = decodeURIComponent(url.pathname);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: BASE_HEADERS });
    }

    /* ---------------- API ---------------- */
    if (pathname === '/api/cart' && request.method === 'GET') {
      const cookie = request.headers.get('cookie') || '';
      const orderNumber = readCookie(cookie, 'bp_oid') || 'LTM-' + Date.now().toString(36).toUpperCase();
      const raw = readCookie(cookie, 'ltm_cart');
      const items = [];
      let total = 0;
      if (raw) {
        for (const seg of raw.split(',').slice(0, 50)) {
          const [sku, q, pr] = seg.split(':');
          if (!sku) continue;
          const qty = parseInt(q, 10) || 1;
          const price = parseInt(pr, 10) || 0;
          items.push({ sku, name: '', qty, price });
          total += price * qty;
        }
      }
      const headers = { ...BASE_HEADERS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
      if (!readCookie(cookie, 'bp_oid')) {
        headers['set-cookie'] = `bp_oid=${orderNumber}; Path=/; Max-Age=604800; SameSite=Lax`;
      }
      return new Response(JSON.stringify({
        order_number: orderNumber, currency: CURRENCY, total,
        total_amount: fmtVnd(total), items, locale: LOCALE,
      }), { headers });
    }

    if (pathname === '/api/checkout' && request.method === 'POST') {
      let body = null;
      try { body = await request.json(); } catch { body = null; }

      const fail = (code, message) => json({ ok: false, error_code: code, message });

      if (!body || typeof body !== 'object') return fail('bad_request', 'Dữ liệu không hợp lệ.');
      if (typeof body.order_number !== 'string' || !body.order_number) return fail('bad_request', 'Thiếu mã đơn hàng.');
      if (!Number.isInteger(body.amount) || body.amount <= 0) return fail('invalid_amount', 'Giá trị đơn hàng không hợp lệ.');

      const c = body.customer || {};
      const fullName = String(c.name || [c.firstname, c.lastname].filter(Boolean).join(' ') || '').trim();
      const addr = String(c.addr || c.address1 || c.address || '').trim();
      const email = String(c.email || '').trim();
      const phone = String(c.phone || c.tel || c.mobile || '').trim();

      if (!fullName) return fail('invalid_name', 'Vui lòng nhập họ tên.');
      if (!email.includes('@')) return fail('invalid_email', 'Email không hợp lệ.');
      if (!phone) return fail('invalid_phone', 'Vui lòng nhập số điện thoại.');
      if (!addr) return fail('invalid_addr', 'Vui lòng nhập địa chỉ.');
      if (/decline/i.test(email)) return fail('card_declined', 'Thanh toán không thành công, vui lòng thử thẻ khác.');

      const key = body.order_number;
      if (DONE.has(key)) return json(DONE.get(key));
      const result = { ok: true, order_number: key };
      DONE.set(key, result);
      console.log('[checkout]', key, body.amount, body.currency);
      return json(result);
    }

    if (pathname.startsWith('/api/order/') && request.method === 'GET') {
      return json({ ok: false, error_code: 'not_found' });
    }

    /* ---------------- 静态资源 ---------------- */
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('method not allowed', { status: 405, headers: BASE_HEADERS });
    }

    let key = resolveKey(pathname);
    let obj = await env.BUCKET.get(key);
    if (!obj) obj = await env.BUCKET.get(key + '.html');
    if (!obj) obj = await env.BUCKET.get(key.replace(/\/+$/, '') + '/index.html');

    if (!obj) {
      if (pathname.startsWith('/api/')) return json({ ok: false, error_code: 'not_found' });
      return new Response('<!doctype html><meta charset="utf-8"><title>404</title><h1>404 Not Found</h1>', {
        status: 404,
        headers: { ...BASE_HEADERS, 'content-type': 'text/html; charset=utf-8' },
      });
    }

    const ext = (key.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase();
    const type = MIME[ext] || obj.httpMetadata?.contentType || 'application/octet-stream';
    const headers = new Headers(BASE_HEADERS);
    headers.set('content-type', type);
    headers.set('cache-control', ext === '.html' ? 'no-cache' : 'public, max-age=86400');
    if (obj.httpMetadata?.contentEncoding) headers.set('content-encoding', obj.httpMetadata.contentEncoding);

    return new Response(request.method === 'HEAD' ? null : obj.body, { headers });
  },
};
