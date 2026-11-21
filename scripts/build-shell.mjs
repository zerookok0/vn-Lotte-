/* [ltm-clone] LOTTE Mart Vietnam — storefront clone (sandbox fixture)
 * visual reference: https://www.lottemart.vn/ (snapshot 2026-11-20)
 * for internal testing / demo use only — not affiliated with LOTTE Mart
 */
/**
 * 生成自建页面（购物车 / 结账 / 成功 / 搜索 / 登录），复用克隆首页的 header + footer 壳。
 *   node scripts/build-shell.mjs
 *
 * 这些页面不含原站业务逻辑，主体由 /assets/clone.js 渲染数据；
 * /bp/ 注入位与 __BP_CART__ 骨架由 server.mjs 在响应时注入（契约 §3）。
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('.');
const PUBLIC = path.join(ROOT, 'public');
const SHELL = path.join(ROOT, 'data', 'raw', 'shell');

const header = await readFile(path.join(SHELL, 'header.html'), 'utf8');
const footer = await readFile(path.join(SHELL, 'footer.html'), 'utf8');

const HEAD = (title) => `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <link rel="icon" href="/media/favicon.ico">
  <link rel="stylesheet" href="/asset/css/bootstrap.min.css">
  <link rel="stylesheet" href="/_next/static/css/bfe73692512055e8.css">
  <link rel="stylesheet" href="/_next/static/css/375a85a193efa97a.css">
  <link rel="stylesheet" href="/assets/clone.css">
  <link rel="stylesheet" href="/bp/connector.css">
  <script defer src="/bp/connector.js"></script>
  <script defer src="/assets/clone.js"></script>
  <!-- ===== Facebook Pixel：把下面 YOUR_PIXEL_ID 换成你的 Pixel ID 即可启用 ===== -->
  <script>
  !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
  n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
  document,'script','https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', 'YOUR_PIXEL_ID');   /* ← 改这里 */
  fbq('track', 'PageView');
  </script>
  <noscript><img height="1" width="1" style="display:none"
    src="https://www.facebook.com/tr?id=YOUR_PIXEL_ID&ev=PageView&noscript=1"/></noscript>
  <!-- ===== /Facebook Pixel ===== -->

</head>
<body>
${header}`;

const FOOT = `
${footer}
</body>
</html>`;

/* ---------------- 购物车 ---------------- */
const cart = HEAD('Giỏ hàng — LOTTE Mart') + `
<main class="clone-main">
  <div class="container clone-container">
    <nav class="clone-breadcrumb"><a href="/">Trang chủ</a> <span>/</span> <strong>Giỏ hàng</strong></nav>
    <h1 class="clone-h1">Giỏ hàng của bạn</h1>
    <div class="clone-cart-layout">
      <div class="clone-cart-items" id="clone-cart-list" data-empty="Giỏ hàng đang trống."></div>
      <aside class="clone-summary">
        <h2 class="clone-summary-title">Tóm tắt đơn hàng</h2>
        <div class="clone-summary-row"><span>Tạm tính</span><strong id="clone-subtotal">0 ₫</strong></div>
        <div class="clone-summary-row"><span>Phí giao hàng</span><strong>Miễn phí</strong></div>
        <div class="clone-summary-row clone-summary-total">
          <span>Tổng cộng</span>
          <strong id="bp-total" data-amount="0" data-currency="VND">0 ₫</strong>
        </div>
        <a class="clone-btn clone-btn-primary clone-btn-block" id="clone-checkout-btn" href="/checkout">Tiến hành thanh toán</a>
        <a class="clone-btn clone-btn-ghost clone-btn-block" href="/">Tiếp tục mua sắm</a>
        <p class="clone-note">Thanh toán với tư cách khách — không cần đăng nhập.</p>
      </aside>
    </div>
  </div>
</main>
` + FOOT;

/* ---------------- 结账 ---------------- */
const checkout = HEAD('Thanh toán — LOTTE Mart') + `
<main class="clone-main">
  <div class="container clone-container">
    <nav class="clone-breadcrumb"><a href="/">Trang chủ</a> <span>/</span> <a href="/cart">Giỏ hàng</a> <span>/</span> <strong>Thanh toán</strong></nav>
    <h1 class="clone-h1">Thanh toán</h1>
    <p class="clone-lead">Bạn đang thanh toán với tư cách <strong>khách</strong> — không cần tạo tài khoản.</p>

    <div class="clone-cart-layout">
      <form id="bp-form" class="clone-form" novalidate autocomplete="on">

        <section class="clone-card">
          <h2 class="clone-card-title">Thông tin nhận hàng</h2>
          <div class="clone-grid">
            <label class="clone-field clone-field-wide">
              <span>Họ và tên</span>
              <input id="t-name" name="name" type="text" autocomplete="name" placeholder="Nguyễn Văn A" required>
            </label>
            <label class="clone-field">
              <span>Email</span>
              <input id="t-email" name="email" type="email" autocomplete="email" placeholder="ban@email.com" required>
            </label>
            <label class="clone-field">
              <span>Số điện thoại</span>
              <input id="t-phone" name="phone" type="tel" autocomplete="tel" placeholder="0901 234 567" required>
            </label>
            <label class="clone-field clone-field-wide">
              <span>Địa chỉ</span>
              <input id="t-addr" name="addr" type="text" autocomplete="address-line1" placeholder="Số nhà, đường" required>
            </label>
            <label class="clone-field">
              <span>Tỉnh / Thành phố</span>
              <input id="t-city" name="city" type="text" autocomplete="address-level1" placeholder="TP. Hồ Chí Minh">
            </label>
            <label class="clone-field">
              <span>Quận / Huyện</span>
              <input id="t-district" name="district" type="text" autocomplete="address-level2" placeholder="Quận 7">
            </label>
            <label class="clone-field clone-field-wide">
              <span>Ghi chú đơn hàng</span>
              <input id="t-note" name="note" type="text" placeholder="Không bắt buộc">
            </label>
          </div>
        </section>

        <section class="clone-card">
          <h2 class="clone-card-title">Phương thức thanh toán</h2>
          <div class="clone-pay-methods">
            <label class="clone-pay-method is-active">
              <input type="radio" name="pay_method" value="card" checked>
              <span>Thẻ quốc tế</span>
            </label>
            <label class="clone-pay-method">
              <input type="radio" name="pay_method" value="cod">
              <span>Thanh toán khi nhận hàng</span>
            </label>
          </div>

          <div class="bp-card-fields clone-card-fields" id="clone-card-fields">
            <label class="clone-field clone-field-wide">
              <span>Số thẻ</span>
              <input id="bp-card-number" name="card-number" type="text" inputmode="numeric"
                     autocomplete="cc-number" maxlength="23" placeholder="Số thẻ">
            </label>
            <div class="clone-grid">
              <label class="clone-field">
                <span>Ngày hết hạn</span>
                <input id="bp-card-expiry" name="card-expiry" type="text" inputmode="numeric"
                       autocomplete="cc-exp" maxlength="7" placeholder="MM/YY">
              </label>
              <label class="clone-field">
                <span>CVC</span>
                <input id="bp-card-cvc" name="card-cvc" type="text" inputmode="numeric"
                       autocomplete="cc-csc" maxlength="4" placeholder="CVC">
              </label>
            </div>
          </div>

          <button id="bp-submit" class="clone-btn clone-btn-primary clone-btn-block clone-btn-pay" type="submit">
            Đặt hàng
          </button>
          <div id="bp-error" role="alert" aria-live="polite"></div>
          <p class="clone-note">Bằng việc đặt hàng, bạn đồng ý với Điều khoản sử dụng và Chính sách bảo mật của LOTTE Mart.</p>
        </section>
      </form>

      <aside class="clone-summary">
        <h2 class="clone-summary-title">Đơn hàng của bạn</h2>
        <div id="clone-summary-items" class="clone-summary-items"></div>
        <div class="clone-summary-row"><span>Tạm tính</span><strong id="clone-subtotal">0 ₫</strong></div>
        <div class="clone-summary-row"><span>Phí giao hàng</span><strong>Miễn phí</strong></div>
        <div class="clone-summary-row clone-summary-total">
          <span>Tổng cộng</span>
          <strong id="bp-total" data-amount="0" data-currency="VND">0 ₫</strong>
        </div>
        <p class="clone-note">Không cần đăng nhập. Đơn hàng được xác nhận ngay sau khi đặt.</p>
      </aside>
    </div>
  </div>
</main>
` + FOOT;

/* ---------------- 成功页 ---------------- */
const order = HEAD('Đặt hàng thành công — LOTTE Mart') + `
<main class="clone-main">
  <div class="container clone-container">
    <div class="clone-order-success">
      <div class="clone-order-check">✓</div>
      <h1 class="clone-h1">Đặt hàng thành công!</h1>
      <p class="clone-lead">Cảm ơn bạn đã mua sắm tại LOTTE Mart.</p>
      <div class="clone-order-box">
        <div class="clone-summary-row"><span>Mã đơn hàng</span><strong id="clone-order-number">—</strong></div>
        <div class="clone-summary-row"><span>Tổng tiền</span><strong id="bp-total" data-amount="0" data-currency="VND">0 ₫</strong></div>
        <div class="clone-summary-row"><span>Hình thức</span><strong>Thanh toán khách (không cần đăng nhập)</strong></div>
      </div>
      <p class="clone-note">Chúng tôi sẽ gửi email xác nhận đơn hàng trong vài phút.</p>
      <div class="clone-order-actions">
        <a class="clone-btn clone-btn-primary" href="/">Tiếp tục mua sắm</a>
        <a class="clone-btn clone-btn-ghost" href="/cart">Xem giỏ hàng</a>
      </div>
    </div>
  </div>
</main>
` + FOOT;

/* ---------------- 搜索 ---------------- */
const search = HEAD('Tìm kiếm — LOTTE Mart') + `
<main class="clone-main">
  <div class="container clone-container">
    <nav class="clone-breadcrumb"><a href="/">Trang chủ</a> <span>/</span> <strong>Tìm kiếm</strong></nav>
    <h1 class="clone-h1" id="clone-search-title">Kết quả tìm kiếm</h1>
    <p class="clone-lead" id="clone-search-meta"></p>
    <div class="clone-product-grid" id="clone-search-results"></div>
  </div>
</main>
` + FOOT;

/* ---------------- 登录（保留了入口，但结账不需要） ---------------- */
const login = HEAD('Đăng nhập — LOTTE Mart') + `
<main class="clone-main">
  <div class="container clone-container">
    <div class="clone-login">
      <h1 class="clone-h1">Đăng nhập</h1>
      <p class="clone-lead">Bạn có thể <a href="/checkout">thanh toán ngay với tư cách khách</a> mà không cần đăng nhập.</p>
      <form class="clone-form" onsubmit="return false">
        <label class="clone-field clone-field-wide">
          <span>Email hoặc số điện thoại</span>
          <input type="text" placeholder="ban@email.com">
        </label>
        <label class="clone-field clone-field-wide">
          <span>Mật khẩu</span>
          <input type="password" placeholder="••••••••">
        </label>
        <button class="clone-btn clone-btn-primary clone-btn-block" type="submit">Đăng nhập</button>
      </form>
      <p class="clone-note">Chưa có tài khoản? <a href="/checkout">Tiếp tục với tư cách khách</a>.</p>
    </div>
  </div>
</main>
` + FOOT;

const pages = { 'cart.html': cart, 'checkout.html': checkout, 'order.html': order, 'search.html': search, 'login.html': login };
for (const [file, html] of Object.entries(pages)) {
  await writeFile(path.join(PUBLIC, file), html, 'utf8');
  console.log(`${file.padEnd(16)} ${(html.length / 1024).toFixed(0)}KB`);
}
