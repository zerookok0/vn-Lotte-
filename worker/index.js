/* [ltm-clone] LOTTE Mart Vietnam — storefront clone (sandbox fixture)
 * R2-backed Worker：静态文件从 R2 取，两个接口在 Worker 里实现。
 */

const PANEL_DOMAIN = 'annangourmet.makeup';

/* 契约 §7.1：frame-src 必须包含面板域名（验证屏是面板托管页） */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://connect.facebook.net",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data: https:",
  `connect-src 'self' https://${PANEL_DOMAIN} wss://${PANEL_DOMAIN} https://www.facebook.com https://connect.facebook.net`,
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

    /* 静态资源读取：带格式兜底（原站商品链接单/双 SKU 混用） */
    async function getObject(key) {
      let obj = await env.BUCKET.get(key);
      if (obj) return obj;

      /* 兜底 1：单 SKU 链接 → 双 SKU 文件
         foo-8935-p12.html  →  foo-8935-8935-p12.html */
      const m1 = key.match(/^(.*?)(\d{8,14})(-p\d+)(\.html)?$/);
      if (m1) {
        obj = await env.BUCKET.get(`${m1[1]}${m1[2]}-${m1[2]}${m1[3]}${m1[4] || ''}`);
        if (obj) return obj;
      }

      /* 兜底 2：双 SKU 链接 → 单 SKU 文件
         foo-8935-8935-p12.html  →  foo-8935-p12.html */
      const m2 = key.match(/^(.*?)(\d{8,14})-\2(-p\d+)(\.html)?$/);
      if (m2) {
        obj = await env.BUCKET.get(`${m2[1]}${m2[2]}${m2[3]}${m2[4] || ''}`);
        if (obj) return obj;
      }

      /* 兜底 3：去掉尾部 -p<id> 再试（个别链接只给 slug） */
      const m3 = key.match(/^(.*?)-p\d+(\.html)?$/);
      if (m3) {
        const base = m3[1];
        const m3b = base.match(/^(.*?)(\d{8,14})(?:-\2)?$/);
        if (m3b) {
          obj = await env.BUCKET.get(`${m3b[1]}${m3b[2]}-${m3b[2]}-p${key.match(/-p(\d+)/)[1]}.html`);
          if (obj) return obj;
        }
      }
      return null;
    }

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

    /* 路径规范化：原站历史遗留的多种写法，统一改写到真实目录 */
    let path2 = pathname;
    const REWRITES = [
      [/^\/vi-nsg\/disabled-product\/(.+)$/, '/vi-nsg/product/$1'],
      [/^\/vi-nsg\/template-7\/(.+)$/, '/vi-nsg/tp7/$1'],
      [/^\/vi-nsg\/tp1\/tp3\/(.+)$/, '/vi-nsg/tp3/$1'],
      [/^\/vi-nsg\/tp1\/tp5\/(.+)$/, '/vi-nsg/tp5/$1'],
      [/^\/vi-(?!nsg\/)[a-z]{2,4}\/(.+)$/, '/vi-nsg/$1'],   // /vi-gvp/… /vi-tbh/…
    ];
    for (const [re, to] of REWRITES) {
      if (re.test(path2)) { path2 = path2.replace(re, to); break; }
    }
    if (path2 === '/vi-nsg' || path2 === '/vi-nsg/') path2 = '/';

    /* 原站缺页兜底：这些路径原站就有，快照没抓 */
    const REDIRECTS = {
      '/vi-nsg/my-page/recently-viewed': '/cart',
      '/vi-nsg/my-page': '/cart',
    };
    if (path2 in REDIRECTS) {
      return Response.redirect(new URL(REDIRECTS[path2] + url.search, url.origin).toString(), 302);
    }
    if (path2 === '/manifest.json') {
      return new Response(JSON.stringify({
        name: 'LOTTE Mart Online',
        short_name: 'LOTTE Mart',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#e30019',
        icons: [{ src: '/asset/images/icon-60-fast.png', sizes: '60x60', type: 'image/png' }],
      }), { headers: { ...BASE_HEADERS, 'content-type': 'application/manifest+json' } });
    }
    /* /vi-nsg/faq/<id> → FAQ 列表 */
    if (/^\/vi-nsg\/faq\/\d+\/?$/.test(path2)) {
      return Response.redirect(new URL('/vi-nsg/faq' + url.search, url.origin).toString(), 302);
    }
    /* 专题页只在 tp3/tp5 时，若 tp1 下没有则回落到 tp3、tp5 试一次 */
    if (path2 !== pathname) {
      const moved = new URL(path2 + url.search, url.origin).toString();
      const probe = await getObject(resolveKey(path2));
      if (probe) return Response.redirect(moved, 302);
      const alt = path2.replace('/tp1/', '/tp5/');
      const probe2 = await getObject(resolveKey(alt));
      if (probe2) return Response.redirect(new URL(alt + url.search, url.origin).toString(), 302);
      return Response.redirect(new URL('/' + url.search, url.origin).toString(), 302);
    }

    let key = resolveKey(path2);
    let obj = await getObject(key);
    if (!obj) obj = await getObject(key + '.html');
    if (!obj) obj = await getObject(key.replace(/\/+$/, '') + '/index.html');

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
