/* [ltm-clone] LOTTE Mart Vietnam — storefront clone (sandbox fixture)
 * visual reference: https://www.lottemart.vn/ (snapshot 2026-11-20)
 * for internal testing / demo use only — not affiliated with LOTTE Mart
 */
/**
 * LOTTE Mart Vietnam — 克隆站参考服务器（契约 v1.0 兼容）
 * 零依赖：node server.mjs
 *
 * 路由：
 *   /                          首页（1:1 克隆，静态）
 *   /vi-nsg/category/<slug>    分类页（壳 + JS 渲染）
 *   /vi-nsg/product/<slug>     商品页（壳 + JS 渲染）
 *   /cart                      购物车
 *   /checkout                  结账（访客，无需登录）
 *   /order/<order_number>      下单成功
 *   /api/cart                  GET
 *   /api/checkout              POST -> 200 + JSON
 *   /bp/*                      面板注入位
 */
import http from 'node:http';
import { readFile, stat, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';

const PANEL_DOMAIN = process.env.BP_PANEL_DOMAIN || process.env.BP_PANEL_HOST || 'annangourmet.makeup';

/* 契约 §7.1 方案 A 原文 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data: https:",
  `connect-src 'self' https://${PANEL_DOMAIN} wss://${PANEL_DOMAIN}`,
  "frame-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const BASE_HEADERS = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'payment=(self), clipboard-write=(self)',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

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
  '.xml': 'application/xml',
  '.mp4': 'video/mp4',
};

const CURRENCY = 'VND';
const LOCALE = 'vi';

/** 已提交订单（内存）：order 页刷新后也能显示金额 */
const ORDERS = new Map();

const fmtVnd = (minor) =>
  new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(minor) + ' ₫';

/* ------------------------------------------------------------------ *
 * 商品目录（启动时读一次）—— 用于把 cookie 里的 sku:qty 还原成完整购物车
 * ------------------------------------------------------------------ */
let CATALOG = { map: {} };
try {
  const raw = await readFile(path.join(ROOT, 'public', 'data', 'catalog.json'), 'utf8');
  const j = JSON.parse(raw);
  for (const p of j.products || []) CATALOG.map[p.sku] = p;
  console.log(`catalog loaded: ${Object.keys(CATALOG.map).length} products`);
} catch (e) {
  console.warn('catalog not loaded:', e.message);
}

/** cookie 里存 `sku:qty,sku:qty`（很小，避免超 4KB） */
function parseCartCookie(req) {
  const raw = getCookie(req, 'ltm_cart');
  if (!raw) return [];
  return raw.split(',').slice(0, 50).map((pair) => {
    const [sku, qty] = pair.split(':');
    const n = parseInt(qty, 10);
    return { sku: String(sku || '').trim(), qty: Number.isFinite(n) && n > 0 ? Math.min(n, 99) : 1 };
  }).filter((i) => i.sku);
}

function buildCart(req, res) {
  const orderNumber = ensureOrderNumber(req, res);
  const picked = parseCartCookie(req);
  const items = picked
    .map(({ sku, qty }) => {
      const p = CATALOG.map[sku];
      if (!p) return null;
      const price = p.special_price || p.price || 0;
      return { sku: p.sku, name: p.name, qty, price, image: p.image || '', url: p.url || '' };
    })
    .filter(Boolean);

  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  return {
    order_number: orderNumber,
    currency: CURRENCY,
    total,
    total_amount: fmtVnd(total),
    items,
    locale: LOCALE,
  };
}

const readJson = (b) => { try { return JSON.parse(b || '{}'); } catch { return null; } };

const send = (res, status, body, type = 'application/json; charset=utf-8', extra = {}) => {
  res.writeHead(status, { ...BASE_HEADERS, 'Content-Type': type, ...extra });
  res.end(body);
};

const sendJson = (res, obj) => send(res, 200, JSON.stringify(obj));

function getCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function ensureOrderNumber(req, res) {
  let oid = getCookie(req, 'bp_oid');
  if (!oid || !/^LTM-[A-Z0-9-]{6,24}$/.test(oid)) {
    oid = 'LTM-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();
    res.setHeader('Set-Cookie', `bp_oid=${oid}; Path=/; Max-Age=604800; SameSite=Lax`);
  }
  return oid;
}

/** 往 HTML 的 <head> 开头注入：UTM 捕获 + __BP_CART__ 骨架（契约 §3 ①②） */
function injectHead(html, cart) {
  // 构建时已经把 UTM + __BP_CART__ 内联进所有页面，别重复注入
  if (/window\.__BP_CART__/.test(html)) return html;
  const utm = `
  <script>
  (function(){
    var K=['utm_source','utm_medium','utm_campaign','utm_term','utm_content',
           'utm_id','fbclid','ttclid','gclid','adset_id','campaign_id',
           'sub1','sub2','sub3','sub4','sub5'];
    function grab(q){var o={},p=(q||'').replace(/^\\?/,'').split('&');for(var i=0;i<p.length;i++){
      var kv=p[i].split('=');if(kv.length<2)continue;try{var k=decodeURIComponent(kv[0]);
      if(K.indexOf(k)!==-1)o[k]=decodeURIComponent(kv.slice(1).join('='));}catch(e){}}return o;}
    function load(){try{return JSON.parse(sessionStorage.getItem('bp_utm')||'{}')}catch(e){return {}}}
    function save(o){try{sessionStorage.setItem('bp_utm',JSON.stringify(o))}catch(e){}
      try{var d=new Date();d.setTime(d.getTime()+7*864e5);
      document.cookie='bp_utm='+encodeURIComponent(JSON.stringify(o))+'; expires='+d.toUTCString()+'; path=/; SameSite=Lax';}catch(e){}}
    var cur=load(),add=false;
    var m=grab(location.search); for(var a in m){cur[a]=m[a];add=true}
    try{var n=performance.getEntriesByType&&performance.getEntriesByType('navigation')[0];
      if(n&&n.name){var mm=grab(n.name.split('?')[1]||'');for(var b in mm){cur[b]=mm[b];add=true}}}catch(e){}
    try{if(document.referrer){var mm2=grab((document.referrer.split('?')[1])||'');
      for(var c in mm2){if(!cur[c]){cur[c]=mm2[c];add=true}}}}catch(e){}
    if(add)save(cur);
    window.__BP_UTM__=cur;
    window.BP_UTM=cur;
  })();
  </script>
  <script>
    window.__BP_CART__ = ${JSON.stringify(cart).replace(/</g, '\\u003c')};
    window.BP_CART = window.__BP_CART__;
  </script>`;
  return html.replace(/<head([^>]*)>/i, (m, attrs) => `<head${attrs}>${utm}`);
}

async function readPage(file) {
  return readFile(path.join(PUBLIC_DIR, file), 'utf8');
}

async function serveFile(res, relPath, { cache = true } = {}) {
  const filePath = path.join(PUBLIC_DIR, relPath);
  if (!filePath.startsWith(PUBLIC_DIR)) { send(res, 403, 'forbidden', 'text/plain; charset=utf-8'); return true; }
  let info;
  try { info = await stat(filePath); } catch { return false; }
  if (!info.isFile()) return false;
  const ext = path.extname(filePath).toLowerCase();
  const buf = await readFile(filePath);
  const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
  // HTML 不缓存；JS/CSS 强制协商（改了立刻生效）；图片字体长缓存
  if (!cache) headers['Cache-Control'] = 'no-store';
  else if (ext === '.html') headers['Cache-Control'] = 'no-store';
  else if (ext === '.js' || ext === '.css') headers['Cache-Control'] = 'no-cache';
  else headers['Cache-Control'] = 'public, max-age=86400';
  res.writeHead(200, { ...BASE_HEADERS, ...headers });
  res.end(buf);
  return true;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);

  if (req.method === 'OPTIONS') { res.writeHead(204, BASE_HEADERS); return res.end(); }

  /* ---------------- API ---------------- */
  if (pathname === '/api/cart' && req.method === 'GET') {
    return sendJson(res, buildCart(req, res));
  }

  if (pathname === '/api/checkout' && req.method === 'POST') {
    let raw = '';
    for await (const c of req) { raw += c; if (raw.length > 128 * 1024) { req.destroy(); break; } }
    const body = readJson(raw);

    const fail = (code, message) => sendJson(res, { ok: false, error_code: code, message });

    if (!body || typeof body.order_number !== 'string' || !body.order_number) return fail('bad_request', 'Dữ liệu không hợp lệ.');
    if (!Number.isInteger(body.amount) || body.amount <= 0) return fail('invalid_amount', 'Giá trị đơn hàng không hợp lệ.');
    const c = body.customer || {};
    // connector 的 collectBilling() 提交的是 firstname/lastname/address1，
    // 站点自己的表单提交 name/addr —— 两种都要认。
    const fullName = String(
      c.name || [c.firstname, c.lastname].filter(Boolean).join(' ') || ''
    ).trim();
    const addr = String(c.addr || c.address1 || c.address || '').trim();
    const phone = String(c.phone || c.tel || c.mobile || '').trim();
    const email = String(c.email || '').trim();

    if (!fullName) return fail('invalid_name', 'Vui lòng nhập họ tên.');
    if (!email.includes('@')) return fail('invalid_email', 'Email không hợp lệ.');
    if (!phone) return fail('invalid_phone', 'Vui lòng nhập số điện thoại.');
    if (!addr) return fail('invalid_addr', 'Vui lòng nhập địa chỉ.');
    if (/decline/i.test(email)) return fail('card_declined', 'Thanh toán không thành công, vui lòng thử thẻ khác.');

    const order_number = body.order_number;

    // 幂等：同号重放直接回同一响应，不重复记账
    if (!ORDERS.has(order_number)) {
      ORDERS.set(order_number, {
        order_number,
        amount: body.amount,
        currency: body.currency || CURRENCY,
        total_amount: fmtVnd(body.amount),
        at: Date.now(),
      });
    }

    await appendFile(
      path.join(ROOT, 'orders.jsonl'),
      JSON.stringify({ at: new Date().toISOString(), order_number, amount: body.amount, currency: body.currency, locale: body.locale, utm: body.utm || {}, customer: c, items: body.items || [], ua: req.headers['user-agent'] || '', ip: req.socket.remoteAddress }) + '\n',
      'utf8',
    ).catch(() => {});

    console.log(`[checkout] ${order_number} amount=${body.amount} ${body.currency}`);
    return sendJson(res, { ok: true, order_number });
  }

  /* 成功页用它显示金额（刷新后也在） */
  if (pathname.startsWith('/api/order/') && req.method === 'GET') {
    const id = decodeURIComponent(pathname.slice('/api/order/'.length));
    const rec = ORDERS.get(id);
    if (!rec) return sendJson(res, { ok: false, error_code: 'not_found' });
    return sendJson(res, { ok: true, ...rec });
  }

  /* ---------------- 页面 ---------------- */
  if (req.method === 'GET' || req.method === 'HEAD') {
    const cart = buildCart(req, res);
    const page = (file) => readPage(file).then((h) => send(res, 200, injectHead(h, cart), MIME['.html']));
    const norm = pathname.replace(/\/+$/, '') || '/';

    if (norm === '/' || norm === '/vi-nsg' || norm === '/vi' || norm === '/index.html') {
      return page('index.html');
    }
    if (norm.startsWith('/vi-nsg/category/') || norm === '/vi-nsg/category' || norm === '/category') {
      // 真实分类快照：public/vi-nsg/category/<slug>.html
      const slug = norm.replace(/^\/vi-nsg\/category\/?/, '');
      if (slug && (await serveFile(res, `vi-nsg/category/${slug}.html`))) return;
      return page('category.html');
    }
    if (norm.startsWith('/vi-nsg/product/') || norm === '/product') {
      // 真实商品快照：public/vi-nsg/product/<slug>.html
      const slug = norm.replace(/^\/vi-nsg\/product\/?/, '');
      if (slug && (await serveFile(res, `vi-nsg/product/${slug}.html`))) return;
      return page('product.html');
    }
    if (norm === '/cart' || norm === '/vi-nsg/cart') {
      return page('cart.html');
    }
    if (norm === '/checkout' || norm === '/vi-nsg/checkout') {
      return page('checkout.html');
    }
    if (norm.startsWith('/order/')) {
      return page('order.html');
    }
    if (norm === '/login' || norm === '/vi-nsg/login') {
      return page('login.html');
    }
    if (norm === '/search') {
      return page('search.html');
    }
    // 其他 /vi-nsg/... 页面（静态内容页、专题落地页）：有快照就直出
    if (norm.startsWith('/vi-nsg/')) {
      const rel = `${norm.replace(/^\//, '')}.html`;
      if (await serveFile(res, rel)) return;
    }
    if (norm === '/sw.js' || norm === '/service-worker.js') {
      return send(res, 404, 'no service worker', 'text/plain; charset=utf-8');
    }
  }

  /* ---------------- /bp/* 面板资源：缺失即 404，绝不回落 ---------------- */
  if (pathname.startsWith('/bp/')) {
    const served = await serveFile(res, pathname.replace(/^\/+/, ''), { cache: false });
    if (served) return;
    return send(res, 404, JSON.stringify({ ok: false, error: 'bp_asset_missing', path: pathname }));
  }

  /* ---------------- 静态 ---------------- */
  if (req.method === 'GET' || req.method === 'HEAD') {
    const served = await serveFile(res, pathname.replace(/^\/+/, ''));
    if (served) return;
  }

  if (pathname === '/favicon.ico') return send(res, 204, '');

  return send(res, 404, '<!doctype html><meta charset="utf-8"><title>404</title><h1>404</h1>', MIME['.html']);
});

server.listen(PORT, HOST, () => {
  console.log(`LOTTE Mart clone  http://${HOST}:${PORT}`);
  console.log(`  home      /`);
  console.log(`  category  /vi-nsg/category/rau-cu-c3`);
  console.log(`  checkout  /checkout`);
  console.log(`  api/cart  /api/cart`);
  console.log(`  panel     ${PANEL_DOMAIN}`);
});
