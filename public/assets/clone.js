/* [ltm-clone] LOTTE Mart Vietnam — storefront clone (sandbox fixture)
 * visual reference: https://www.lottemart.vn/ (snapshot 2026-11-20)
 * for internal testing / demo use only — not affiliated with LOTTE Mart
 */
/* ==========================================================================
 * LOTTE Mart clone — 前端交互层
 *
 * 职责：
 *   1. 购物车（localStorage，访客可用，无需登录）
 *   2. 商品卡「加入购物车」→ 头部角标 + toast
 *   3. /cart 渲染、数量增减、删除
 *   4. /checkout 汇总 + 契约提交流程（fetch → 200 JSON → /order/<号>）
 *   5. /order/<号> 成功页
 *   6. /search?q= 本地搜索
 *   7. 维护 window.__BP_CART__（原地 mutate，契约 §5.1）
 * ========================================================================== */
(function () {
  'use strict';

  var CART_KEY = 'ltm_cart_v1';
  var ORDER_KEY = 'ltm_last_order_v1';
  var CURRENCY = 'VND';
  var LOCALE = 'vi';

  /* 商品目录（按 sku 查准确价格/图，异步懒加载） */
  var CATALOG = null;
  var catalogPromise = null;
  function loadCatalog() {
    if (catalogPromise) return catalogPromise;
    catalogPromise = fetch('/data/catalog.json')
      .then(function (r) { return r.json(); })
      .then(function (cat) {
        var map = {};
        for (var i = 0; i < (cat.products || []).length; i++) map[cat.products[i].sku] = cat.products[i];
        CATALOG = { map: map, list: cat.products || [] };
        return CATALOG;
      })
      .catch(function () { CATALOG = { map: {}, list: [] }; return CATALOG; });
    return catalogPromise;
  }

  /* ---------------- 工具 ---------------- */

  function money(minor) {
    return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Number(minor) || 0) + ' ₫';
  }

  function parsePrice(text) {
    var digits = String(text || '').replace(/[^\d]/g, '');
    return digits ? parseInt(digits, 10) : 0;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function skuFromHref(href) {
    var m = String(href || '').match(/-(\d{8,14})-p\d+/);
    return m ? m[1] : String(href || '');
  }

  /* ---------------- 购物车状态 ---------------- */

  function readCart() {
    try {
      var raw = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      if (Array.isArray(raw) && raw.length) return raw.filter(function (i) { return i && i.sku && i.qty > 0; });
    } catch (e) {}
    // localStorage 空了但服务端已经按 cookie 注入过购物车 → 用它恢复
    var c = window.__BP_CART__;
    if (c && Array.isArray(c.items) && c.items.length) {
      var restored = c.items.map(function (i) {
        return { sku: i.sku, name: i.name, price: i.price, qty: i.qty, image: i.image || '', url: i.url || '' };
      }).filter(function (i) { return i.sku; });
      try { localStorage.setItem(CART_KEY, JSON.stringify(restored)); } catch (e) {}
      return restored;
    }
    return [];
  }

  /** 下单成功后把「单号|金额」写进 cookie：order 页刷新/纯静态托管下也能显示金额 */
  function writeOrderCookie(orderNumber, amount) {
    try {
      document.cookie = 'ltm_last_order=' + encodeURIComponent(String(orderNumber) + '|' + String(amount || 0))
        + '; path=/; max-age=604800; SameSite=Lax';
    } catch (e) {}
  }

  function readOrderCookie() {
    try {
      var m = document.cookie.match(/(?:^|;\s*)ltm_last_order=([^;]+)/);
      if (!m) return null;
      var parts = decodeURIComponent(m[1]).split('|');
      if (!parts[0]) return null;
      return { order_number: parts[0], total: Number(parts[1]) || 0 };
    } catch (e) { return null; }
  }

  /** cookie 镜像（服务端据此在注入 __BP_CART__ 时还原购物车，connector 首帧就能读到正确金额） */
  function writeCartCookie(items) {
    try {
      var v = items.map(function (i) { return i.sku + ':' + i.qty; }).join(',');
      document.cookie = 'ltm_cart=' + encodeURIComponent(v) + '; path=/; max-age=604800; SameSite=Lax';
    } catch (e) {}
  }

  function writeCart(items) {
    try { localStorage.setItem(CART_KEY, JSON.stringify(items)); } catch (e) {}
    writeCartCookie(items);
    syncCart(items);
  }

  function cartTotal(items) {
    return items.reduce(function (s, i) { return s + i.price * i.qty; }, 0);
  }

  function cartCount(items) {
    return items.reduce(function (s, i) { return s + i.qty; }, 0);
  }

  var pendingReload = null;
  function reloadIfNeeded() {
    var path = location.pathname.replace(/\/+$/, '') || '/';
    if (pendingReload === path) return;
    pendingReload = path;
  }

  function addItem(item) {
    var items = readCart();
    var found = null;
    for (var i = 0; i < items.length; i++) {
      if (items[i].sku === item.sku) { found = items[i]; break; }
    }
    if (found) found.qty += item.qty || 1;
    else items.push({ sku: item.sku, name: item.name, price: item.price, image: item.image, url: item.url, qty: item.qty || 1 });
    writeCart(items);
    renderHeaderBadge(items);
    toast('Đã thêm vào giỏ hàng: ' + item.name);
    renderPage();
  }

  function setQty(sku, qty) {
    var items = readCart();
    for (var i = 0; i < items.length; i++) {
      if (items[i].sku === sku) { items[i].qty = Math.max(1, Math.min(99, qty)); break; }
    }
    writeCart(items);
    renderHeaderBadge(items);
    renderPage();
  }

  function removeItem(sku) {
    writeCart(readCart().filter(function (i) { return i.sku !== sku; }));
    renderHeaderBadge(readCart());
    renderPage();
  }

  /* ---------------- 契约：__BP_CART__ ---------------- */

  function syncCart(items) {
    var c = window.__BP_CART__;
    if (!c || typeof c !== 'object') return;   // 骨架由服务端注入，绝不替换对象（契约 §8-12）
    var total = cartTotal(items);
    c.currency = CURRENCY;
    c.total = total;
    c.total_amount = money(total);
    c.items = items.map(function (i) {
      return { sku: i.sku, name: i.name, qty: i.qty, price: i.price, image: i.image || '', url: i.url || '' };
    });
    c.locale = LOCALE;
    window.dispatchEvent(new CustomEvent('bp:cart-ready', { detail: c }));
    renderTotals();
  }

  /** #bp-total 三处同源：文本 / data-amount / __BP_CART__.total_amount */
  function renderTotals() {
    var c = window.__BP_CART__ || {};
    var total = Number(c.total) || 0;
    var amountText = c.total_amount || money(total);
    var els = document.querySelectorAll('#bp-total');
    for (var i = 0; i < els.length; i++) {
      els[i].textContent = amountText;
      els[i].dataset.amount = String(total);
      els[i].dataset.currency = CURRENCY;
    }
    var sub = document.getElementById('clone-subtotal');
    if (sub) sub.textContent = money(total);
  }

  /* ---------------- 头部角标 ---------------- */

  function renderHeaderBadge(items) {
    items = items || readCart();
    var count = cartCount(items);
    var cartLink = document.querySelector('a[href="/cart"]');
    if (!cartLink) return;
    var badge = cartLink.querySelector('.clone-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'clone-badge';
      cartLink.appendChild(badge);
    }
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.style.display = count > 0 ? 'inline-flex' : 'none';
  }

  /* ---------------- toast ---------------- */

  var toastTimer = null;
  function toast(msg) {
    var el = document.getElementById('clone-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'clone-toast';
      el.className = 'clone-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('is-show'); }, 2200);
  }

  /* ---------------- 商品卡 → 数据 ---------------- */

  function cardData(a) {
    var href = a.getAttribute('href') || '';
    var scope = a.closest('.item') || a.closest('.product-type-col') || a.parentElement;
    var nameEl = scope && scope.querySelector('.field-name a');
    var priceEl = scope && (scope.querySelector('.field-price') || scope.querySelector('[class*="field-price"]'));
    var imgEl = a.querySelector('img');
    var holder = a.querySelector('span');
    var image = '';
    if (imgEl && imgEl.getAttribute('src')) image = imgEl.getAttribute('src');
    else if (holder) {
      var bg = getComputedStyle(holder).backgroundImage || '';
      var m = bg.match(/url\("?([^")]+)"?\)/);
      if (m) image = m[1];
    }
    var name = (nameEl && nameEl.textContent.trim()) || a.getAttribute('title') || a.textContent.trim();
    var priceText = priceEl ? priceEl.textContent : '';
    // 促销时 .field-price 可能是现价；优先取最小非零价格
    var prices = [];
    if (priceEl) {
      var nums = priceText.split(/[^\d.]{2,}/).map(parsePrice).filter(function (n) { return n > 0; });
      prices = prices.concat(nums);
    }
    var price = prices.length ? Math.min.apply(null, prices) : 0;

    var sku = skuFromHref(href);
    // 有 catalog 时以 API 数据为准（DOM 里的价格文本可能含原价/促销价混排）
    if (CATALOG && CATALOG.map[sku]) {
      var cp = CATALOG.map[sku];
      var real = cp.special_price || cp.price;
      if (real > 0) price = real;
      if (cp.image) image = cp.image;
      if (cp.name) name = cp.name;
    }

    return { sku: sku, name: name, price: price, image: image, url: href, qty: 1 };
  }

  /* ---------------- 事件委托 ---------------- */

  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.btn-cart, .clone-add-cart');
    if (btn) {
      e.preventDefault();
      var a = btn.closest('.field-img')?.querySelector('a[href*="/product/"]')
        || btn.closest('[data-product]')
        || btn.closest('.item')?.querySelector('a[href*="/product/"]');
      if (!a) return;
      var data = cardData(a);
      if (!data.price) {
        // 价格没解析出来时从 title 里再试一次
        data.price = parsePrice(btn.getAttribute('data-price') || '');
      }
      if (!data.name) return;
      addItem(data);
      return;
    }

    var qtyBtn = e.target.closest && e.target.closest('[data-qty]');
    if (qtyBtn) {
      e.preventDefault();
      var sku = qtyBtn.getAttribute('data-sku');
      var delta = Number(qtyBtn.getAttribute('data-qty'));
      var items = readCart();
      for (var i = 0; i < items.length; i++) {
        if (items[i].sku === sku) { setQty(sku, items[i].qty + delta); break; }
      }
      return;
    }

    var rmBtn = e.target.closest && e.target.closest('[data-remove]');
    if (rmBtn) {
      e.preventDefault();
      removeItem(rmBtn.getAttribute('data-remove'));
    }
  });

  /* 头部搜索框 → /search?q= */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    var input = e.target;
    if (!input || input.tagName !== 'INPUT') return;
    if (!/search/i.test(input.className + ' ' + (input.id || '') + ' ' + (input.name || '') + ' ' + (input.placeholder || ''))) return;
    var q = String(input.value || '').trim();
    if (!q) return;
    e.preventDefault();
    location.href = '/search?q=' + encodeURIComponent(q);
  });
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.search-box button, [class*="search"] button');
    if (!b) return;
    var box = b.closest('[class*="search"]');
    var input = box && box.querySelector('input');
    if (!input || !input.value.trim()) return;
    e.preventDefault();
    location.href = '/search?q=' + encodeURIComponent(input.value.trim());
  });

  /* ---------------- 页面渲染 ---------------- */

  function renderCartPage() {
    var list = document.getElementById('clone-cart-list');
    if (!list) return;
    var items = readCart();

    if (!items.length) {
      list.innerHTML = '<div class="clone-empty"><p>Giỏ hàng đang trống.</p><a class="clone-btn clone-btn-primary" href="/">Tiếp tục mua sắm</a></div>';
      renderTotals();
      var btn0 = document.getElementById('clone-checkout-btn');
      if (btn0) btn0.classList.add('is-disabled');
      return;
    }

    list.innerHTML = items.map(function (i) {
      return '' +
        '<div class="clone-cart-row" data-sku="' + esc(i.sku) + '">' +
          '<a class="clone-cart-thumb" href="' + esc(i.url) + '">' +
            (i.image ? '<img src="' + esc(i.image) + '" alt="' + esc(i.name) + '" loading="lazy">' : '') +
          '</a>' +
          '<div class="clone-cart-info">' +
            '<a class="clone-cart-name" href="' + esc(i.url) + '">' + esc(i.name) + '</a>' +
            '<div class="clone-cart-price">' + money(i.price) + '</div>' +
            '<div class="clone-qty">' +
              '<button type="button" data-qty="-1" data-sku="' + esc(i.sku) + '" aria-label="giảm">−</button>' +
              '<span>' + i.qty + '</span>' +
              '<button type="button" data-qty="1" data-sku="' + esc(i.sku) + '" aria-label="tăng">+</button>' +
            '</div>' +
          '</div>' +
          '<div class="clone-cart-line-total">' + money(i.price * i.qty) + '</div>' +
          '<button type="button" class="clone-cart-remove" data-remove="' + esc(i.sku) + '" aria-label="xóa">×</button>' +
        '</div>';
    }).join('');

    renderTotals();
  }

  function renderCheckoutPage() {
    var box = document.getElementById('clone-summary-items');
    if (box) {
      var items = readCart();
      box.innerHTML = items.map(function (i) {
        return '' +
          '<div class="clone-summary-item">' +
            (i.image ? '<img src="' + esc(i.image) + '" alt="">' : '') +
            '<div class="clone-summary-item-info">' +
              '<span class="clone-summary-item-name">' + esc(i.name) + '</span>' +
              '<span class="clone-summary-item-qty">x' + i.qty + '</span>' +
            '</div>' +
            '<strong>' + money(i.price * i.qty) + '</strong>' +
          '</div>';
      }).join('') || '<p class="clone-note">Giỏ hàng trống.</p>';
    }
    renderTotals();
  }

  function renderOrderPage() {
    var el = document.getElementById('clone-order-number');
    if (!el) return;
    var m = location.pathname.match(/\/order\/([^/?#]+)/);
    var orderNumber = m ? decodeURIComponent(m[1]) : '—';
    el.textContent = orderNumber;

    function apply(amount, amountText) {
      var c = window.__BP_CART__;
      var total = Number(amount) || 0;
      var text = amountText || money(total);
      if (c && typeof c === 'object') {
        c.total = total;
        c.total_amount = text;
      }
      renderTotals();
      // connector 在 order 页仍会按空购物车 applyCart(0)；这里守住金额 10 秒
      var el = document.getElementById('bp-total');
      if (!el || !window.MutationObserver) return;
      var mo = new MutationObserver(function () {
        if (el.textContent !== text) {
          el.textContent = text;
          el.dataset.amount = String(total);
          el.dataset.currency = CURRENCY;
        }
      });
      mo.observe(el, { childList: true, characterData: true, subtree: true });
      setTimeout(function () { mo.disconnect(); }, 10000);
    }

    // 1) 提交时存的摘要（同一会话内最快）
    var last = null;
    try { last = JSON.parse(sessionStorage.getItem(ORDER_KEY) || 'null'); } catch (e) {}
    if (last && last.order_number === orderNumber && last.total) {
      apply(last.total, last.total_amount);
      return;
    }

    // 2) cookie（纯静态托管 / 刷新后仍在）
    var ck = readOrderCookie();
    if (ck && ck.order_number === orderNumber && ck.total) {
      apply(ck.total, money(ck.total));
      return;
    }

    // 3) 回落服务端记录（本地参考服务器 / 有后端的形态）
    fetch('/api/order/' + encodeURIComponent(orderNumber))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (d && d.ok && d.amount) apply(d.amount, d.total_amount);
        else renderTotals();
      })
      .catch(function () { renderTotals(); });
  }

  function renderPage() {
    var path = location.pathname.replace(/\/+$/, '') || '/';
    if (path === '/cart') renderCartPage();
    else if (path === '/checkout') renderCheckoutPage();
    else if (path.indexOf('/order/') === 0) renderOrderPage();
  }

  /* ---------------- 结账提交（契约 §6） ---------------- */

  function bindCheckout() {
    var form = document.getElementById('bp-form');
    if (!form) return;

    // 支付方式切换：COD 时隐藏卡字段但不移除（DOM 必须在，契约 §4）
    var radios = document.querySelectorAll('input[name="pay_method"]');
    for (var r = 0; r < radios.length; r++) {
      radios[r].addEventListener('change', function (e) {
        var isCard = e.target.value === 'card';
        var wrap = document.getElementById('clone-card-fields');
        if (wrap) wrap.style.display = isCard ? '' : 'none';
        var label = e.target.closest('.clone-pay-method');
        var all = document.querySelectorAll('.clone-pay-method');
        for (var i = 0; i < all.length; i++) all[i].classList.remove('is-active');
        if (label) label.classList.add('is-active');
      });
    }

    function text(id) {
      var el = document.getElementById(id);
      return el ? String(el.value || '').trim() : '';
    }

    function setError(msg) {
      var box = document.getElementById('bp-error');
      if (box) box.textContent = msg || '';   // 只写 textContent，绝不 display:none（契约 §4.1）
    }

    function busy(on) {
      var btn = document.getElementById('bp-submit');
      if (!btn) return;
      btn.setAttribute('aria-busy', on ? 'true' : 'false');
      btn.dataset.busy = on ? '1' : '0';
    }

    var lastOrder = null;

    form.addEventListener('submit', function (e) {
      // 无条件阻止原生提交：没有 connector 时也不会把卡号塞进 URL（契约 §4.2）
      e.preventDefault();

      // connector 已接管提交（它在本脚本之前注册，负责校验/校验屏/跳转）。
      // 站点侧此时完全让位，避免两套校验与两套 /api/checkout 抢跳转。
      if (window.BPConnector) return;

      var items = readCart();
      if (!items.length) { setError('Giỏ hàng đang trống.'); return; }

      var payMethod = (document.querySelector('input[name="pay_method"]:checked') || {}).value || 'card';
      var cardNo = text('bp-card-number').replace(/\s+/g, '');
      var exp = text('bp-card-expiry');
      var cvc = text('bp-card-cvc');

      if (payMethod === 'card') {
        if (!/^\d{13,19}$/.test(cardNo)) { setError('Vui lòng nhập số thẻ hợp lệ.'); return; }
        if (!/^\d{2}\s*\/?\s*\d{2,4}$/.test(exp)) { setError('Ngày hết hạn không hợp lệ (MM/YY).'); return; }
        var mm = parseInt(exp.slice(0, 2), 10);
        if (!(mm >= 1 && mm <= 12)) { setError('Tháng hết hạn phải từ 01 đến 12.'); return; }
        if (cvc.length < 3) { setError('Vui lòng nhập CVC (3–4 số).'); return; }
      }
      if (!text('t-name')) { setError('Vui lòng nhập họ tên.'); return; }
      if (!text('t-email').match(/^[^@\s]+@[^@\s]+\.[^@\s]+$/)) { setError('Email không hợp lệ.'); return; }
      if (!text('t-phone')) { setError('Vui lòng nhập số điện thoại.'); return; }
      if (!text('t-addr')) { setError('Vui lòng nhập địa chỉ nhận hàng.'); return; }

      // 面板 connector 已接管：它在本脚本之前注册 submit，会自己 POST /api/checkout
      // 并负责跳转。这里只保留校验兜底，不重复发请求（避免两套流程抢跳转）。
      var c = window.__BP_CART__ || {};
      var payload = {
        order_number: c.order_number || '',
        amount: cartTotal(items),
        currency: CURRENCY,
        locale: LOCALE,
        utm: window.__BP_UTM__ || window.BP_UTM || {},
        customer: {
          name: text('t-name'),
          email: text('t-email'),
          phone: text('t-phone'),
          addr: text('t-addr'),
          city: text('t-city'),
          district: text('t-district'),
          note: text('t-note'),
          country: 'VN'
        },
        items: items.map(function (i) { return { sku: i.sku, name: i.name, qty: i.qty, price: i.price }; }),
        pay_method: payMethod
      };

      // 面板 connector 可监听这个事件拿一次性快照
      document.dispatchEvent(new CustomEvent('bp:submit', { detail: payload, bubbles: true }));

      if (lastOrder === payload.order_number) return;
      lastOrder = payload.order_number;

      setError('');
      busy(true);

      window.fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (res) {
        return res.json().catch(function () {
          return { ok: false, error_code: 'bad_response', message: 'Máy chủ trả về dữ liệu không hợp lệ.' };
        });
      }).then(function (data) {
        if (!data || data.ok !== true) {
          var err = new Error((data && data.message) || 'Đặt hàng không thành công.');
          err.bpBusiness = true;
          throw err;
        }
        // 成功页需要显示金额，先把摘要存下来（购物车随后清空）
        try {
          sessionStorage.setItem(ORDER_KEY, JSON.stringify({
            order_number: data.order_number,
            total: payload.amount,
            total_amount: money(payload.amount),
            at: Date.now()
          }));
          localStorage.removeItem(CART_KEY);
          writeCartCookie([]);
          writeOrderCookie(data.order_number, payload.amount);
        } catch (e) {}
        // 契约 §6.1：跳转由前端决定
        window.location.href = '/order/' + encodeURIComponent(data.order_number) + location.search;
      }).catch(function (err) {
        busy(false);
        lastOrder = null;
        if (err && err.bpBusiness) setError(err.message);
        else setError(navigator.onLine === false ? 'Mất kết nối mạng. Vui lòng thử lại.' : 'Có lỗi khi gửi đơn hàng. Vui lòng thử lại.');
      });
    });
  }

  /* ---------------- 搜索 ---------------- */

  function renderSearchPage() {
    var box = document.getElementById('clone-search-results');
    if (!box) return;
    var q = new URLSearchParams(location.search).get('q') || '';
    var titleEl = document.getElementById('clone-search-title');
    var metaEl = document.getElementById('clone-search-meta');
    if (titleEl) titleEl.textContent = q ? 'Kết quả cho "' + q + '"' : 'Tất cả sản phẩm';

    box.innerHTML = '<p class="clone-note">Đang tải…</p>';

    fetch('/data/catalog.json').then(function (r) { return r.json(); }).then(function (cat) {
      var needle = q.toLowerCase().trim();
      var list = (cat.products || []).filter(function (p) {
        if (!needle) return true;
        return String(p.name || '').toLowerCase().indexOf(needle) !== -1;
      }).slice(0, 60);

      if (metaEl) metaEl.textContent = list.length + ' sản phẩm';

      if (!list.length) {
        box.innerHTML = '<div class="clone-empty"><p>Không tìm thấy sản phẩm phù hợp.</p><a class="clone-btn clone-btn-primary" href="/">Về trang chủ</a></div>';
        return;
      }

      box.innerHTML = list.map(function (p) {
        return '' +
          '<div class="clone-product-card">' +
            '<a href="' + esc(p.url) + '" class="clone-product-thumb">' +
              (p.image ? '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy">' : '') +
            '</a>' +
            '<a href="' + esc(p.url) + '" class="clone-product-name">' + esc(p.name) + '</a>' +
            '<div class="clone-product-price">' + esc(p.special_price_formatted || p.price_formatted || money(p.price)) + '</div>' +
            '<button class="clone-add-cart btn-cart" type="button" data-price="' + (p.special_price || p.price) + '">Thêm vào giỏ</button>' +
          '</div>';
      }).join('');
    }).catch(function () {
      box.innerHTML = '<p class="clone-note">Không tải được dữ liệu sản phẩm.</p>';
    });
  }

  /* ---------------- 启动 ---------------- */

  function boot() {
    loadCatalog();          // 后台预热商品目录（加购时用于取准确价格）
    var items = readCart();
    writeCartCookie(items); // 让服务端下次渲染时能注入同一份购物车
    syncCart(items);
    renderHeaderBadge(items);
    renderPage();

    // connector 提交成功（它 dispatch 的 window 事件）→ 记下金额、清空购物车
    window.addEventListener('bp:submitted', function (e) {
      var d = (e && e.detail) || {};
      var c = window.__BP_CART__ || {};
      try {
        sessionStorage.setItem(ORDER_KEY, JSON.stringify({
          order_number: d.order_number || c.order_number || '',
          total: Number(c.total) || 0,
          total_amount: c.total_amount || '',
          at: Date.now()
        }));
        localStorage.removeItem(CART_KEY);
        writeCartCookie([]);
        writeOrderCookie(d.order_number || c.order_number, Number(c.total) || 0);
      } catch (err) {}
    });

    var path = location.pathname.replace(/\/+$/, '') || '/';
    if (path === '/checkout') bindCheckout();
    if (path === '/search') renderSearchPage();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // 供 connector / 调试读取
  window.LTM = {
    cart: readCart,
    add: addItem,
    total: function () { return cartTotal(readCart()); },
    money: money,
    rerender: renderPage
  };
})();
