<!-- [ltm-clone] LOTTE Mart Vietnam — storefront clone (sandbox fixture)
visual reference: https://www.lottemart.vn/ (snapshot 2026-11-20)
for internal testing / demo use only — not affiliated with LOTTE Mart -->

# LOTTE Mart Vietnam — 站点克隆

按 `https://www.lottemart.vn/` 的**渲染结果**做的 1:1 前端克隆：同一套 CSS、同一批图片、同一份文案与商品数据。
在原站基础上做了两处改动：

1. **结账不再要求登录** —— 全站购物车走 `localStorage`，游客可直接下单。
2. **结账页是自建的** —— 保留 `/bp/` 面板注入位与契约 DOM（`#bp-card-number` 等），提交走 `fetch` + JSON。

> 仅用于内部测试/演示。与原站运营方无任何关联。

---

## 效果对照

| 页面 | 原站 | 克隆 |
|---|---|---|
| 首页 | `/` | `/`（`index.html`，1440×13828 → 1440×13821，逐区块一致） |
| 分类 | `/vi-nsg/category/rau-cu-c3` | 同路径（`category.html`） |
| 商品 | `/vi-nsg/product/<slug>-p<id>` | 同路径（`product.html`） |
| 购物车 | `/cart`（需登录，抓下来是错误页） | `/cart`（自建，游客可用） |
| 结账 | `/checkout`（需登录） | `/checkout`（自建，游客可用） |
| 成功页 | — | `/order/<order_number>` |
| 搜索 | 原站接口 | `/search?q=`（本地 catalog 过滤） |
| 登录 | `/login` | `/login`（保留入口，结账**不**依赖它） |

静态资源：`public/asset`、`public/media`、`public/_next` 共 **1600+ 文件 / 73 MB**，全部本地化，离线可跑。

---

## 快速开始

```bash
npm install                 # 只装 playwright-core（抓取脚本用）
node server.mjs             # http://127.0.0.1:8787
node scripts/e2e.mjs        # 端到端：首页→加购→购物车→结账→成功页
```

打开 `http://127.0.0.1:8787/?utm_source=fb&adset_id=123`。

---

## 目录

```
.
├── server.mjs                  # 参考服务器：路由 + /api/* + CSP + __BP_CART__ 注入
├── wrangler.toml               # Cloudflare Pages 配置（functions/ 自动加载）
├── functions/api/
│   ├── cart.js                 # GET  /api/cart
│   └── checkout.js             # POST /api/checkout
├── public/
│   ├── index.html              # 首页（渲染快照，已去 Next 运行时）
│   ├── category.html           # 分类页
│   ├── product.html            # 商品页
│   ├── cart.html               # 购物车（自建）
│   ├── checkout.html           # 结账（自建，契约 DOM）
│   ├── order.html              # 成功页
│   ├── search.html             # 搜索
│   ├── login.html              # 登录（保留入口）
│   ├── _headers                # Cloudflare 响应头（CSP 等）
│   ├── _redirects              # Cloudflare 路由重写
│   ├── assets/
│   │   ├── clone.js            # 交互层：购物车 / 加购 / 结账提交
│   │   └── clone.css           # 自建页面样式
│   ├── data/catalog.json       # 427 个商品 + 399 个分类（来自原站 API）
│   ├── asset/ media/ _next/    # 原站静态资源（CSS、图片、字体、图标）
│   └── bp/                     # 面板注入位（connector.js/css、config.json、3ds/*）
├── scripts/                    # 抓取 / 构建 / 校验流水线
├── reference/                  # connector 参考实现（不部署）
└── docs/                       # 契约对齐报告、部署说明
```

---

## 抓取与构建流水线

前端是**快照 + 数据驱动**：先抓原站渲染结果，再清理成静态页，商品数据来自原站 API。

```bash
node scripts/crawl.mjs --shots        # 1. Playwright 打开原站，存渲染后 HTML + 截图
node scripts/download-assets.mjs      # 2. 下载页面引用到的 CSS/图片
node scripts/build-catalog.mjs        # 3. 生成 public/data/catalog.json（427 商品/399 分类）
node scripts/build-pages.mjs          # 4. 清理 HTML（去 script、域名本地化、回填商品图）
node scripts/download-missing.mjs     # 5. 补齐 catalog 里引用但还没下载的图片
node scripts/extract-shell.mjs        # 6. 抽出 header/footer 壳
node scripts/build-shell.mjs          # 7. 生成 cart/checkout/order/search/login
node scripts/fetch-yt-thumbs.mjs      # 8. YouTube 封面（iframe 被 CSP 拦，改缩略图）
node scripts/add-headers.mjs          # 9. 给源文件补统一标头
```

`data/raw/` 是抓取中间产物（渲染 HTML、API 响应、截图），**已列入 .gitignore**。

---

## 与原站的实现差异（必要说明）

| 项 | 原站 | 克隆 | 原因 |
|---|---|---|---|
| Next.js 运行时 | React hydration + swiper | 移除，纯静态 | 克隆只保视觉与流程；轮播停在首帧 |
| 门店选择弹窗 | 首屏弹出，选完才加载商品 | 无（默认南西贡门店已选中） | 快照是在选好门店后抓的 |
| 购物车 | 服务端 + 登录态 | `localStorage` | 取消登录要求 |
| 结账 | 需登录 + 平台支付 | 访客结账 + 契约表单 | 同上 |
| YouTube 区块 | `<iframe>` | 封面图 + 外链 | CSP `frame-src 'self'` 不允许第三方帧 |
| 分页 / Xem thêm | 客户端分页 | 静态快照（首屏 100 条） | 快照只保留抓取时渲染出的部分 |
| 追踪脚本 | GTM / FB / TikTok | 全部移除 | 克隆不埋点 |

---

## 结账与 `/bp/` 契约

结账页与面板的耦合点保持在 `docs/CONTRACT-COMPLIANCE.md` 描述的那一套：

- `window.__BP_CART__`：`{order_number, currency:'VND', total(整数 đồng), total_amount, items:[{name,qty,price}], locale:'vi'}`，**原地 mutate**
- `#bp-card-number` / `#bp-card-expiry` / `#bp-card-cvc`：真 `<input type="text">`，同源、无 Shadow DOM
- `#bp-total`：文本 = `data-amount` = `__BP_CART__.total_amount`
- `#bp-error`：常驻，只用 `textContent` 写
- `#bp-submit`：用 `aria-busy`，不 `disabled`
- 提交：`POST /api/checkout` → 200 + `{ok:true, order_number}`，前端 `location.href = '/order/' + order_number`
- 注入位：`/bp/connector.js` + `/bp/connector.css`（占位存根，面板包覆盖即可）

面板域名在 `server.mjs` 的 `BP_PANEL_DOMAIN` 环境变量和 `public/_headers` 的 `connect-src` 两处，改成你的域名即可。

---

## 部署

### GitHub

```bash
git init
git add -A
git commit -m "LOTTE Mart clone: static storefront + guest checkout"
git branch -M main
git remote add origin https://github.com/<你的账号>/<仓库名>.git
git push -u origin main
```

### Cloudflare Pages（推荐）

1. Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git → 选仓库
2. Build command：**留空**；Build output directory：**`public`**
3. 环境变量：`BP_PANEL_DOMAIN=panel.example.com`（可选，`_headers` 里也改一处）
4. `functions/` 会被自动识别为 Pages Functions，`/api/cart`、`/api/checkout` 直接生效

或者命令行：

```bash
npm i -g wrangler
wrangler pages deploy public --project-name lottemart-clone
```

### 自己 VPS / nginx

把 `public/` 丢到站点根目录，`/api/*` 由 `server.mjs`（或任意后端）提供。nginx 需要两条重写：

```nginx
location /vi-nsg/category/ { try_files $uri /category.html; }
location /vi-nsg/product/  { try_files $uri /product.html; }
```

---

## 已知限制

1. **分类页只有 `rau-cu-c3` 是真实快照**，其他 398 个分类共用同一份页面（视觉一致，商品网格是抓取时那一批）。要更多分类，跑 `scripts/grab-category-api.mjs` 增量抓。
2. **商品详情页只有 `bo-lat-anchor-mieng-200g` 是真实快照**，其他商品 URL 复用同一页；要按 URL 渲染不同商品，需要扩 `clone.js` 的 `product` 渲染分支。
3. **分页 / 加载更多**是静态的，不会真的拉下一页。
4. `data/raw/` 与 `orders.jsonl` 不入库（含抓取中间产物与订单明文）。
5. 面板 `/bp/connector.js` 目前是占位存根，正式包覆盖后即接管。

---

## 许可与声明

本项目是**前端克隆练习/测试夹具**，与原站运营方 LOTTE Mart Vietnam 无关联，不含其商标授权。
商品数据与图片版权归原权利人所有，仅用于本地测试环境，不用于对外商业服务。
