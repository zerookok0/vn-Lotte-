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
    catalogPromise = fetch('/data/catalog.json', { cache: 'no-cache' })
      .then(function (r) { return r.json(); })
      .then(function (cat) {
        var map = {};
        for (var i = 0; i < (cat.products || []).length; i++) map[cat.products[i].sku] = cat.products[i];
        CATALOG = { map: map, list: cat.products || [], banners: cat.banners || [] };
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

  /** cookie 镜像（服务端 / 内联骨架据此还原购物车，connector 首帧就能读到正确金额） */
  function writeCartCookie(items) {
    try {
      var v = items.map(function (i) { return i.sku + ':' + i.qty + ':' + (i.price || 0); }).join(',');
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

  /** 找到「当前真实可见」的购物车图标宿主元素
   *  桌面端是 a[href="/cart"]，移动端是包着 .icon-cart 的那个 a（href 指向商品页#）*/
  function findCartIconEl() {
    var icons = document.querySelectorAll('.header-app .icon-cart, .header-app [class*="icon-cart"]');
    for (var i = 0; i < icons.length; i++) {
      var host = icons[i].closest('a') || icons[i].closest('button') || icons[i].parentElement;
      if (host && host.getBoundingClientRect().width > 1) return host;
    }
    var fallback = document.querySelector('.header-app a[href="/cart"], a[href="/cart"].btn-shopping-cart');
    return fallback || null;
  }

  function renderHeaderBadge(items) {
    items = items || readCart();
    var count = cartCount(items);
    var host = findCartIconEl();
    if (!host) return;

    var badge = host.querySelector('.clone-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'clone-badge';
      host.appendChild(badge);
    }
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
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
    // 顶部购物车图标：原站是「打开购物袋侧栏」的触发器（href 指向商品页#），
    // 静态版直接跳购物车页。
    var cartIcon = e.target.closest && e.target.closest('.header-app .icon-cart, .header-app [class*="icon-cart"]');
    if (cartIcon) {
      var host = cartIcon.closest('a') || cartIcon.closest('button');
      if (host && !/\/cart\/?$/.test(host.getAttribute('href') || '')) {
        e.preventDefault();
        location.href = '/cart';
        return;
      }
    }

    var btn = e.target.closest && e.target.closest('.btn-cart, .clone-add-cart');
    if (btn) {
      e.preventDefault();
      // 搜索结果卡 / 模板渲染卡：数据直接挂在按钮上
      if (btn.dataset && btn.dataset.sku) {
        addItem({
          sku: btn.dataset.sku,
          name: btn.dataset.name || '',
          price: Number(btn.dataset.price) || 0,
          image: btn.dataset.image || '',
          url: btn.dataset.url || '',
          qty: 1
        });
        return;
      }
      var a = btn.closest('.field-img')?.querySelector('a[href*="/product/"]')
        || btn.closest('[data-product]')
        || btn.closest('.item')?.querySelector('a[href*="/product/"]');
      if (!a) return;
      var data = cardData(a);
      if (!data.price) {
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

  /* 搜索表单：原站是 <form> 无 action，原生提交只会把 ?q= 拼到当前 URL。
     这里统一接管，改成跳 /search（捕获阶段，先于任何其它 submit 处理） */
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || form.tagName !== 'FORM') return;
    var input = form.querySelector('input[name="q"], input[name="search_input"], input[type="text"]');
    if (!input) return;
    e.preventDefault();
    var q = String(input.value || '').trim();
    if (q) location.href = '/search?q=' + encodeURIComponent(q);
  }, true);

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.search-box button, [class*="search"] button');
    if (!b) return;
    var box = b.closest('[class*="search"]');
    var input = box && box.querySelector('input');
    if (!input || !input.value.trim()) return;
    e.preventDefault();
    location.href = '/search?q=' + encodeURIComponent(input.value.trim());
  });

  /* 专题页二级 tab：原站靠 JS 筛选，静态版按商品名关键词过滤 */
  var TAB_FILTER = {
    'Tất cả sản phẩm': null,
    'Dầu đậu nành': ['đậu nành', 'dau nanh'],
    'Dầu hạt cải, hướng dương': ['hạt cải', 'hướng dương', 'canola', 'sunflower'],
    'Dầu oliu': ['oliu', 'ô liu', 'olive'],
    'Dầu mè': ['mè', 'sesame'],
    'Dầu thực vật': ['thực vật'],
  };

  function applyTabFilter(kws) {
    var boxes = document.querySelectorAll('.item');
    var shown = 0;
    for (var i = 0; i < boxes.length; i++) {
      var el = boxes[i];
      var nameEl = el.querySelector('.field-name');
      if (!nameEl) continue;
      var name = String(nameEl.textContent || '').toLowerCase();
      var show = !kws || kws.some(function (k) { return name.indexOf(k) !== -1; });
      el.style.display = show ? '' : 'none';
      if (show) shown++;
    }
    return shown;
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.tab-menu button[title]');
    if (!btn) return;
    var title = btn.getAttribute('title');
    if (!(title in TAB_FILTER)) return;

    var slide = btn.closest('.swiper-slide');
    if (slide && slide.parentNode) {
      var sibs = slide.parentNode.children;
      for (var i = 0; i < sibs.length; i++) {
        if (sibs[i] !== slide) sibs[i].classList.remove('active', 'swiper-slide-active');
      }
      slide.classList.add('active', 'swiper-slide-active');
    }
    var n = applyTabFilter(TAB_FILTER[title]);
    if (!n) { toast('Không có sản phẩm phù hợp'); applyTabFilter(null); }
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

    // 全量索引（14749 商品）：[sku, name, url, price, image]
    fetch('/data/search-index.json', { cache: 'force-cache' })
      .then(function (r) { return r.json(); })
      .then(function (rows) {
        var needle = q.toLowerCase().trim();
        var hits = [];
        for (var i = 0; i < rows.length; i++) {
          var row = rows[i];
          if (!needle || String(row[1]).toLowerCase().indexOf(needle) !== -1) {
            hits.push(row);
            if (hits.length >= 60) break;
          }
        }

        if (metaEl) metaEl.textContent = hits.length + ' sản phẩm' + (hits.length >= 60 ? ' (hiển thị 60)' : '');

        if (!hits.length) {
          box.innerHTML = '<div class="clone-empty"><p>Không tìm thấy sản phẩm phù hợp.</p><a class="clone-btn clone-btn-primary" href="/">Về trang chủ</a></div>';
          return;
        }

        box.innerHTML = hits.map(function (row) {
          var sku = row[0], name = row[1], url = row[2], price = row[3], image = row[4];
          return ''
            + '<div class="clone-product-card">'
            + '<a href="' + esc(url) + '" class="clone-product-thumb">'
            + (image ? '<img src="' + esc(image) + '" alt="' + esc(name) + '" loading="lazy">' : '')
            + '</a>'
            + '<a href="' + esc(url) + '" class="clone-product-name">' + esc(name) + '</a>'
            + '<div class="clone-product-price">' + esc(money(price)) + '</div>'
            + '<button class="clone-add-cart btn-cart" type="button" data-price="' + (price || 0) + '" data-sku="' + esc(sku) + '" data-name="' + esc(name) + '" data-url="' + esc(url) + '" data-image="' + esc(image || '') + '">Thêm vào giỏ</button>'
            + '</div>';
        }).join('');
      })
      .catch(function () {
        box.innerHTML = '<p class="clone-note">Không tải được dữ liệu sản phẩm.</p>';
      });
  }

  /* ---------------- 启动 ---------------- */

  /* ---------------- 首页欢迎弹窗 ----------------
   * 原站这个 modal-welcome 的关闭行为挂在 React 上，静态快照里没有任何监听。
   * 这里补：X 按钮 / 点遮罩 / Esc 关闭；勾了「今天不再显示」就记 24 小时。
   */
  function bindWelcomePopup() {
    var modal = document.querySelector('.modal-welcome');
    if (!modal) return;

    var backdrops = document.querySelectorAll('.modal-backdrop');
    var KEY = 'ltm_popup_hidden_until';
    var check = modal.querySelector('.checkbox-cs input[type="checkbox"]');
    var closeBtn = modal.querySelector('.btn-close');

    function hidePopup() {
      modal.classList.remove('show');
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
      for (var i = 0; i < backdrops.length; i++) {
        backdrops[i].classList.remove('show');
        backdrops[i].style.display = 'none';
      }
      document.body.classList.remove('modal-open');
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    }

    function remember() {
      if (!check || !check.checked) return;
      try { localStorage.setItem(KEY, String(Date.now() + 86400000)); } catch (e) {}
    }

    // 之前勾过「今天不再显示」→ 进页面直接不显示
    var until = 0;
    try { until = Number(localStorage.getItem(KEY) || 0); } catch (e) {}
    if (until && Date.now() < until) { hidePopup(); return; }

    if (closeBtn) {
      closeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        remember();
        hidePopup();
      });
    }

    for (var i = 0; i < backdrops.length; i++) {
      backdrops[i].addEventListener('click', function (e) {
        e.preventDefault();
        remember();
        hidePopup();
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.style.display !== 'none') {
        remember();
        hidePopup();
      }
    });
  }

  /* ---------------- 静态快照里失效的交互 ----------------
   * 原站靠 React + swiper 驱动，快照里这些控件只剩 DOM。这里补最小行为：
   *   1. 轮播左右箭头（每个 .swiper 独立）
   *   2. .dropdown-toggle 展开/收起 .dropdown-menu（语言、门店、通知等）
   */
  function bindSwipers() {
    var list = document.querySelectorAll('.swiper');
    for (var i = 0; i < list.length; i++) {
      (function (sw) {
        var wrapper = sw.querySelector('.swiper-wrapper');
        if (!wrapper) return;
        var slides = wrapper.children;
        if (!slides || slides.length < 2) return;

        var next = sw.querySelector('.swiper-button-next');
        var prev = sw.querySelector('.swiper-button-prev');
        if (!next && !prev) return;

        var idx = 0;
        for (var k = 0; k < slides.length; k++) {
          if (slides[k].classList.contains('swiper-slide-active')) { idx = k; break; }
        }

        function go(n) {
          idx = (n + slides.length) % slides.length;
          var target = slides[idx];
          wrapper.style.transitionDuration = '300ms';
          wrapper.style.transform = 'translate3d(' + (-target.offsetLeft) + 'px, 0px, 0px)';
          for (var j = 0; j < slides.length; j++) {
            slides[j].classList.toggle('swiper-slide-active', j === idx);
          }
          var cur = sw.querySelector('.swiper-pagination-current');
          if (cur) cur.textContent = String(idx + 1);
          var bullets = sw.querySelectorAll('.swiper-pagination-bullet');
          for (var b = 0; b < bullets.length; b++) {
            bullets[b].classList.toggle('swiper-pagination-bullet-active', b === idx);
          }
        }

        if (next) next.addEventListener('click', function (e) { e.preventDefault(); go(idx + 1); });
        if (prev) prev.addEventListener('click', function (e) { e.preventDefault(); go(idx - 1); });
      })(list[i]);
    }
  }

  function bindDropdowns() {
    function closeAll() {
      var opened = document.querySelectorAll('.dropdown-menu.show');
      for (var i = 0; i < opened.length; i++) {
        opened[i].classList.remove('show');
        opened[i].style.display = '';
      }
    }
    document.addEventListener('click', function (e) {
      var toggle = e.target.closest && e.target.closest('.dropdown-toggle');
      if (!toggle) { closeAll(); return; }
      // 门店选择器：静态站只有「南西贡」一个门店，不提供切换
      if (toggle.closest('.locate-block')) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      var dd = toggle.closest('.dropdown');
      if (!dd) return;
      var menu = dd.querySelector('.dropdown-menu');
      if (!menu) return;
      e.preventDefault();
      e.stopPropagation();
      var wasOpen = menu.classList.contains('show');
      closeAll();
      if (!wasOpen) {
        // 原站用 react-bootstrap，静态样式表里 .dropdown-menu 的可见性规则不全，
        // 这里直接写 inline style，避免被更高优先级规则覆盖。
        menu.classList.add('show');
        menu.style.display = 'block';
        menu.style.position = 'absolute';
        menu.style.zIndex = '1050';
      }
    }, true);
  }

  /* ---------------- 移动端适配 ---------------- */
  function isMobile() {
    return window.matchMedia('(max-width: 767px)').matches;
  }

  /** 手机端首图：换成 750 宽的移动版 banner（原站 1200x340 在手机上会被裁掉两边） */
  function applyMobileBanners() {
    if (!isMobile() || !CATALOG || !CATALOG.banners) return;
    var map = {};
    for (var i = 0; i < CATALOG.banners.length; i++) {
      var b = CATALOG.banners[i];
      if (b.web && b.mobile) map[b.web] = b.mobile;
    }
    var imgs = document.querySelectorAll('.main-slide img, .swiper-slide img');
    for (var k = 0; k < imgs.length; k++) {
      var src = imgs[k].getAttribute('src') || '';
      if (map[src]) {
        imgs[k].setAttribute('src', map[src]);
        imgs[k].removeAttribute('srcset');
      }
    }
  }

  /** 手机端商品行改成原生横向滑动（原站是 swiper 库，静态版用 CSS 滚动替代） */
  function bindMobileCarousels() {
    if (!isMobile()) return;
    var wrappers = document.querySelectorAll('.swiper-wrapper');
    for (var i = 0; i < wrappers.length; i++) {
      var w = wrappers[i];
      var isMain = !!w.closest('.main-slide');
      w.style.transform = 'none';
      w.style.display = 'flex';
      w.style.overflowX = 'auto';
      w.style.overflowY = 'hidden';
      w.style.webkitOverflowScrolling = 'touch';
      w.style.scrollSnapType = 'x mandatory';
      w.style.scrollbarWidth = 'none';
      w.style.gap = isMain ? '0px' : '10px';
      w.style.paddingBottom = '2px';

      var kids = w.children;
      for (var j = 0; j < kids.length; j++) {
        var s = kids[j];
        s.style.width = isMain ? '100vw' : '44vw';
        s.style.marginRight = '0px';
        s.style.flex = '0 0 auto';
        s.style.scrollSnapAlign = 'start';
      }
    }
    var arrows = document.querySelectorAll('.swiper-button-next, .swiper-button-prev');
    for (var a = 0; a < arrows.length; a++) arrows[a].style.display = 'none';
  }

  /** 商品详情页：绑定「Thêm vào giỏ hàng」和数量加减 */
  function bindProductPage() {
    var sku = skuFromPath(location.pathname);
    if (!sku) return;

    function productData() {
      // 优先用分片数据（模板渲染页已加载），其次 catalog，最后才从 DOM 猜
      var injected = window.__LTM_PRODUCT__;
      var p = (injected && String(injected.sku) === sku) ? injected
        : (CATALOG && CATALOG.map ? CATALOG.map[sku] : null);

      var name = (p && p.name) || '';
      if (!name) {
        var nameEl = document.querySelector('.product-custom h2, .product-custom h1:not(.logo), .product-single h2');
        if (nameEl) name = nameEl.textContent;
      }
      if (!name) {
        var og = document.querySelector('meta[property="og:title"]');
        if (og) name = String(og.getAttribute('content') || '').replace(/\s*-\s*Mua ngay.*$/, '');
      }
      if (!name) name = document.title.replace(/\s*-\s*LOTTE Mart.*$/, '');

      var price = p ? (p.special_price || p.price) : 0;
      var image = (p && (p.image || p.thumb)) || '';
      if (!price) {
        var el = document.querySelector('.product-custom .field-price, .field-price');
        if (el) price = parseInt(String(el.textContent).replace(/[^\d]/g, ''), 10) || 0;
      }
      if (!image) {
        var img = document.querySelector('.swiper-gallery img, .product-img-slide-wrap img');
        if (img) image = img.getAttribute('src') || '';
      }
      return {
        sku: sku,
        name: String(name || '').trim(),
        price: price,
        image: image,
        url: location.pathname,
        qty: qtyValue()
      };
    }

    function qtyValue() {
      var input = document.querySelector('.blk-actions input[name^="quant"], input[name^="quant"], .qty input');
      var v = input ? parseInt(input.value || '1', 10) : 1;
      return Number.isFinite(v) && v > 0 ? Math.min(v, 99) : 1;
    }

    // 主加购按钮
    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest(
        'button[title="Thêm vào giỏ hàng"], button[title="Thêm vào giỏ"], .btn-add-cart, .blk-actions .btn-primary'
      );
      if (!btn) return;
      e.preventDefault();
      var data = productData();
      if (!data.price) { toast('Không đọc được giá sản phẩm.'); return; }
      addItem(data);
    }, true);

    // 数量 +/-
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.btn-number[data-type]');
      if (!b) return;
      e.preventDefault();
      var input = b.parentElement.querySelector('input') || document.querySelector('input[name^="quant"]');
      if (!input) return;
      var v = parseInt(input.value || '1', 10) || 1;
      input.value = String(b.getAttribute('data-type') === 'plus' ? v + 1 : Math.max(1, v - 1));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, true);
  }

  /** 从 URL 取 SKU：兼容规范格式 slug-sku-p<id> 和残缺格式 /vi-nsg/product/<sku> */
  function skuFromPath(p) {
    var m = String(p).match(/-(\d{8,14})-p\d+/);
    if (m) return m[1];
    m = String(p).match(/\/vi-nsg\/product\/(\d{8,14})\/?$/);
    return m ? m[1] : null;
  }

  /** 商品页：当当前 slug 没有真实快照（落到模板页）时，按 URL 里的 SKU 拉分片数据渲染 */
  function renderProductFromData() {
    var sku = skuFromPath(location.pathname);
    if (!sku) return;

    fetch('/data/p/' + sku.slice(0, 2) + '.json', { cache: 'force-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (shard) {
        if (!shard || !shard.products) return;
        var p = null;
        for (var i = 0; i < shard.products.length; i++) {
          if (String(shard.products[i].sku) === sku) { p = shard.products[i]; break; }
        }
        if (!p) return;
        window.__LTM_SHARD_POOL__ = shard.products;
        window.__LTM_PRODUCT__ = p;

        // 已经是该商品的真实快照 → 不用动
        var titleNow = document.title || '';
        if (titleNow.indexOf(p.name.slice(0, 24)) === 0) return;

        applyProductData(p);
      })
      .catch(function () {});
  }

  function applyProductData(p) {
    var price = p.special_price || p.price || 0;
    var priceText = p.special_price_formatted || p.price_formatted || money(price);

    document.title = p.name + ' - LOTTE Mart Online';

    // og / meta
    var og = document.querySelector('meta[property="og:title"]');
    if (og) og.setAttribute('content', p.name + ' - Mua ngay tại LOTTE Mart!');
    var ogi = document.querySelector('meta[property="og:image"]');
    if (ogi && p.image_big) ogi.setAttribute('content', p.image_big);

    // 面包屑最后一项
    var crumb = document.querySelector('section.breadcrumb ul li:last-child');
    if (crumb) {
      var link = crumb.querySelector('a') || crumb.querySelector('button');
      if (link) link.textContent = p.name;
      else crumb.textContent = p.name;
    }

    // 商品名（模板里是 .product-custom 下的 h2）
    var h2 = document.querySelector('.product-custom h2');
    if (h2) h2.textContent = p.name;
    var h1 = document.querySelector('.product-custom h1');
    if (h1) h1.textContent = p.name;

    // 价格
    var priceEl = document.querySelector('.product-custom .field-price');
    if (priceEl) priceEl.textContent = priceText;
    var oldEl = document.querySelector('.product-custom .field-price-old');
    if (oldEl) {
      if (p.special_price && p.price && p.special_price !== p.price) {
        oldEl.textContent = p.price_formatted || money(p.price);
        oldEl.style.display = '';
      } else {
        oldEl.textContent = '';
        oldEl.style.display = 'none';
      }
    }

    // 画廊：所有主图换成该商品的图（用已下载的 300x300，0x0 大图没抓）
    var big = p.image || p.image_big;
    if (big) {
      var gs = document.querySelectorAll('.swiper-gallery img, .product-img-slide-wrap img');
      for (var i = 0; i < gs.length; i++) {
        gs[i].setAttribute('src', big);
        gs[i].removeAttribute('srcset');
        gs[i].setAttribute('alt', p.name);
      }
      var thumbs = document.querySelectorAll('.swiper-gallery-thumb img');
      for (var j = 0; j < thumbs.length; j++) {
        thumbs[j].setAttribute('src', p.image || big);
        thumbs[j].removeAttribute('srcset');
        if (thumbs[j].parentElement) thumbs[j].parentElement.style.backgroundImage = 'none';
      }
    }

    // 库存 / 单位
    var viewed = document.querySelector('.product-custom .lbl-viewed');
    if (viewed) viewed.textContent = String(p.stock_qty || 0) + ' còn hàng';

    // 描述：有新数据就替换，没有就清空——绝不能露出模板商品的文案
    var desc = document.querySelector('.pro-tab-content .short-desc, .pro-tab-content');
    if (desc) {
      var text = String(p.short_description || '').trim();
      var usage = String(p.usage_notes || '').trim();
      if (text || usage) {
        desc.innerHTML = (text ? '<p>' + text.replace(/[<>]/g, '') + '</p>' : '')
          + (usage && usage !== text ? '<p>' + usage.replace(/[<>]/g, '') + '</p>' : '');
      } else {
        desc.innerHTML = '<p>' + String(p.name).replace(/[<>]/g, '') + '</p>';
      }
    }

    // 模板页里「相关商品」也用同分片的商品替换，避免露出模板商品的推荐
    try {
      var rels = document.querySelectorAll('.list-products-grid .item');
      var pool = (window.__LTM_SHARD_POOL__ || []);
      for (var k = 0; k < rels.length && k < pool.length; k++) {
        var q = pool[k];
        if (!q || q.sku === p.sku) continue;
        var a = rels[k].querySelector('a[href*="/vi-nsg/product/"]');
        var img = rels[k].querySelector('img');
        var nameEl = rels[k].querySelector('.field-name a');
        var pe = rels[k].querySelector('.field-price');
        if (a) a.setAttribute('href', q.url);
        if (img && (q.image || q.thumbnail)) { img.setAttribute('src', q.image || q.thumbnail); img.removeAttribute('srcset'); }
        if (nameEl) nameEl.textContent = q.name;
        if (pe) pe.textContent = q.special_price_formatted || q.price_formatted || '';
      }
    } catch (e) {}

    // __BP_CART__ 的订单号不变（契约要求单号复用）
    syncTotal();
  }

  /* 坏图兜底：原站有少量图片本身 403（客户晒图、评价图），不要留破图图标 */
  document.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t.tagName === 'IMG' && !t.dataset.bpBroken) {
      t.dataset.bpBroken = '1';
      t.style.visibility = 'hidden';
      if (t.parentElement && !t.parentElement.textContent.trim()) {
        t.parentElement.style.background = '#f5f5f5';
      }
    }
  }, true);

  /* ---------------- 首页促销弹窗（全场 5 折，倒计时到越南时间当天 24:00） ---------------- */
  function vnRemainMs() {
    // 越南 = UTC+7。Date.now() 本身就是 UTC 毫秒，直接 +7h 再按 UTC 读，
    // 不要再加 getTimezoneOffset()（那是浏览器本地时区，会多算一次）。
    var vnMs = Date.now() + 7 * 3600000;
    var vn = new Date(vnMs);
    var endOfDay = Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate(), 23, 59, 59, 999);
    return Math.max(0, endOfDay - vnMs);
  }

  function fmtClock(ms) {
    var total = Math.floor(ms / 1000);
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    var pad = function (n) { return n < 10 ? '0' + n : String(n); };
    return pad(h) + ':' + pad(m) + ':' + pad(s);
  }

  function bindPromoPopup() {
    var KEY = 'ltm_promo_closed_until';
    var now = Date.now();
    var until = 0;
    try { until = Number(localStorage.getItem(KEY) || 0); } catch (e) {}
    if (until && now < until) return;   // 当天已手动关掉

    var overlay = document.createElement('div');
    overlay.className = 'promo-overlay';
    overlay.id = 'promo-overlay';
    overlay.innerHTML = ''
      + '<div class="promo-box" role="dialog" aria-modal="true" aria-label="Ưu đãi 50%">'
      + '  <button type="button" class="promo-close" aria-label="Đóng">×</button>'
      + '  <picture>'
      + '    <source media="(max-width: 640px)" srcset="/media/promo/50off-mobile.webp">'
      + '    <img class="promo-img" src="/media/promo/50off-desktop.webp" alt="LOTTE Mart ưu đãi đặc biệt 50% OFF" width="1536" height="1024">'
      + '  </picture>'
      + '  <div class="promo-count">'
      + '    <div class="promo-count-label">Chương trình kết thúc sau</div>'
      + '    <div class="promo-time" id="promo-time">00:00:00</div>'
      + '  </div>'
      + '  <a class="promo-cta" href="/vi-nsg/tp5/sinh-nhat-lotte">Mua ngay →</a>'
      + '</div>';

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    var timeEl = document.getElementById('promo-time');
    var tick = function () {
      var left = vnRemainMs();
      if (timeEl) timeEl.textContent = left > 0 ? fmtClock(left) : '00:00:00';
      if (left <= 0) {
        clearInterval(timer);
        if (timeEl) timeEl.textContent = 'Đã kết thúc';
      }
    };
    tick();
    var timer = setInterval(tick, 1000);

    function close() {
      clearInterval(timer);
      overlay.remove();
      document.body.style.overflow = '';
      // 记到越南时间当天结束，明天再弹
      try {
        var nowVn = Date.now() + 7 * 3600000;
        var vn = new Date(nowVn);
        var endUtc = Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate(), 23, 59, 59, 999);
        var remain = Math.max(0, endUtc - nowVn);
        localStorage.setItem(KEY, String(Date.now() + remain));
      } catch (e) {}
    }

    var btn = overlay.querySelector('.promo-close');
    if (btn) btn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });
    document.addEventListener('keydown', function escClose(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escClose); }
    });
  }

  /* ---------------- 分类页「Xem thêm」：从本地数据续载 ---------------- */
  var PAGED = { catId: null, skus: [], shown: 0, data: null, loading: false, busy: false };

  function collectRenderedSkus() {
    var set = {};
    var links = document.querySelectorAll('a[href*="/vi-nsg/product/"]');
    for (var i = 0; i < links.length; i++) {
      var m = String(links[i].getAttribute('href') || '').match(/-(\d{8,14})(?:-\d{8,14})?-p\d+/);
      if (m) set[m[1]] = 1;
    }
    return set;
  }

  function priceHtml(d) {
    var disc = '<span class="lbl-discount"><strong>Giảm giá</strong>-50%</span>';
    return '<div class="field-price-old ">' + money(d.o) + '</div>'
      + '<div class="field-price ">' + disc + '<span>' + money(d.p) + '</span></div>';
  }

  function money(n) {
    return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' ₫';
  }

  function buildCard(template, sku, d) {
    var el = template.cloneNode(true);
    /* 卡片里有多个指向商品页的 <a>（图片、名称、评分…），必须全部改，否则有的还指向模板商品 */
    var links = el.querySelectorAll('a[href*="/vi-nsg/product/"]');
    for (var li = 0; li < links.length; li++) {
      links[li].setAttribute('href', d.u);
      links[li].removeAttribute('data-sku');
    }
    var a = el.querySelector('.field-name a');
    if (a) { a.setAttribute('title', d.n); a.textContent = d.n; }
    /* 图片 */
    var imgHost = el.querySelector('.field-img .img') || el.querySelector('.field-img span') || el.querySelector('.img');
    if (imgHost) {
      imgHost.style.backgroundImage = "url('" + d.i + "')";
      imgHost.style.backgroundSize = 'cover';
      imgHost.style.backgroundPosition = 'center center';
      imgHost.style.backgroundRepeat = 'no-repeat';
    }
    var innerImg = el.querySelector('.field-img img');
    if (innerImg) { innerImg.setAttribute('src', d.i); innerImg.setAttribute('alt', d.n); }
    /* 价格 */
    var priceBox = el.querySelector('.field-price-old');
    if (priceBox && priceBox.parentNode) {
      var holder = priceBox.parentNode;
      var keep = holder.querySelector('.field-price');
      if (keep) keep.remove();
      priceBox.remove();
      holder.insertAdjacentHTML('afterbegin', priceHtml(d));
    }
    /* 评分 / 浏览 */
    var score = el.querySelector('.field-score');
    if (score) {
      score.innerHTML = (d.r ? '<span class="lbl-rating"><span class="icon w-20"></span>' + Number(d.r).toFixed(1) + '</span>' : '')
        + (d.w ? '<span class="lbl-viewed">' + d.w + ' Lượt xem</span>' : '');
    }
    /* 加购按钮带上 sku */
    var btn = el.querySelector('.btn-cart');
    if (btn) {
      btn.setAttribute('data-sku', sku);
      btn.setAttribute('data-url', d.u);
      btn.style.display = d.s === 0 ? 'none' : '';
    }
    return el;
  }

  function bindCategoryLoadMore() {
    var m = location.pathname.match(/-c(\d+)$/);
    if (!m) return;
    var catId = m[1];

    /* 只认「带价格的商品卡」——header 搜索下拉里也有 .item，不能用它当模板 */
    var sampleItem = document.querySelector('.item:has(.field-price)')
      || (document.querySelector('.field-name')
        ? document.querySelector('.field-name').closest('.item')
        : null);
    if (!sampleItem) return;

    var sampleCol = sampleItem.closest('.col') || sampleItem.parentNode;
    var grid = sampleCol.parentNode;
    if (!grid) return;

    var rendered = collectRenderedSkus();

    fetch('/data/cat-index.json', { cache: 'force-cache' })
      .then(function (r) { return r.json(); })
      .then(function (idx) {
        var list = idx[catId] || [];
        if (list.length <= rendered_count(list, rendered)) return;
        PAGED.catId = catId;
        PAGED.skus = list;

        var wrap = document.createElement('div');
        wrap.className = 'clone-loadmore-wrap';
        wrap.innerHTML = '<button type="button" class="clone-loadmore">Xem thêm sản phẩm</button>'
          + '<div class="clone-loadmore-meta"></div>';
        grid.parentNode.insertBefore(wrap, grid.nextSibling);

        var btn = wrap.querySelector('.clone-loadmore');
        var meta = wrap.querySelector('.clone-loadmore-meta');

        function updateMeta() {
          var shown = Object.keys(rendered).length;
          var total = list.length;
          meta.textContent = 'Đã hiển thị ' + Math.min(shown, total) + ' / ' + total + ' sản phẩm';
          if (shown >= total) { btn.style.display = 'none'; }
        }
        updateMeta();

        btn.addEventListener('click', function () {
          if (PAGED.busy) return;
          PAGED.busy = true;
          btn.textContent = 'Đang tải…';

          var next = [];
          for (var i = 0; i < list.length && next.length < 50; i++) {
            if (!rendered[list[i]]) next.push(list[i]);
          }
          if (!next.length) { btn.style.display = 'none'; PAGED.busy = false; return; }

          (PAGED.data ? Promise.resolve(PAGED.data) : fetch('/data/card-data.json', { cache: 'force-cache' }).then(function (r) { return r.json(); }))
            .then(function (data) {
              PAGED.data = data;
              var frag = document.createDocumentFragment();
              for (var k = 0; k < next.length; k++) {
                var sku = next[k];
                var d = data[sku];
                rendered[sku] = 1;
                if (!d) continue;
                frag.appendChild(buildCard(sampleCol, sku, d));
              }
              grid.appendChild(frag);
              btn.textContent = 'Xem thêm sản phẩm';
              PAGED.busy = false;
              updateMeta();
            })
            .catch(function () {
              btn.textContent = 'Xem thêm sản phẩm';
              PAGED.busy = false;
              toast('Không tải được dữ liệu');
            });
        });
      })
      .catch(function () { });
  }

  function rendered_count(list, set) {
    var n = 0;
    for (var i = 0; i < list.length; i++) if (set[list[i]]) n++;
    return n;
  }

  /* ---------------- 首页「Mua Gì Hôm Nay」等区块的 tab 切换 ---------------- */
  var HOME_TABS = {
    'Giao 60 Phút': { type: 'all' },
    'Thủy sản': { type: 'cat', id: '495' },
    'Gạo': { type: 'cat', id: '584' },
    'Dầu Ăn': { type: 'cat', id: '201' },
    'Sữa': { type: 'cat', id: '158' },
    'Giá Tốt': { type: 'all' },
    'Mưa Quà Tặng': { type: 'none' },
    'Trà, Cà Phê': { type: 'cat', id: '140' },
    'Mì, Bún, Topokki Ăn Liền': { type: 'cat', id: '190' },
    'Chăm Sóc Nhà Cửa': { type: 'cat', id: '356' },
    'Khăn Tắm, Bông Tắm': { type: 'cat', id: '664' },
    'Nồi, Chảo': { type: 'cat', id: '372' },
    'Dụng Cụ Bếp Khác': { type: 'cat', id: '379' },
  };

  var TAB_DATA = { index: null, cards: null };

  function loadTabData() {
    if (TAB_DATA.cards) return Promise.resolve(TAB_DATA);
    return Promise.all([
      fetch('/data/cat-index.json', { cache: 'force-cache' }).then(function (r) { return r.json(); }),
      fetch('/data/card-data.json', { cache: 'force-cache' }).then(function (r) { return r.json(); }),
    ]).then(function (arr) {
      TAB_DATA.index = arr[0];
      TAB_DATA.cards = arr[1];
      return TAB_DATA;
    });
  }

  function skusForTab(cfg) {
    var idx = TAB_DATA.index || {};
    var cards = TAB_DATA.cards || {};
    if (cfg.type === 'cat') return idx[cfg.id] || [];
    if (cfg.type === 'all') {
      /* 全部商品（按 cat-index 里出现顺序去重） */
      var seen = {}, out = [];
      for (var k in idx) {
        if (k === '_meta') continue;
        var list = idx[k];
        for (var i = 0; i < list.length && out.length < 200; i++) {
          if (!seen[list[i]]) { seen[list[i]] = 1; out.push(list[i]); }
        }
        if (out.length >= 200) break;
      }
      return out;
    }
    if (cfg.type === 'kw') {
      var q = cfg.q.toLowerCase();
      return Object.keys(cards).filter(function (sku) {
        return String(cards[sku].n || '').toLowerCase().indexOf(q) !== -1;
      }).slice(0, 200);
    }
    return [];
  }

  function bindHomeTabs() {
    var sections = document.querySelectorAll('.section.top-products, .section');
    var bound = 0;

    for (var s = 0; s < sections.length; s++) {
      var section = sections[s];
      var tabButtons = section.querySelectorAll('.tab-menu button[title]');
      if (!tabButtons.length) continue;

      /* 商品列表在 .tab-content 里（.tab-menu 里的那个 swiper-wrapper 是 tab 按钮本身） */
      var grid = section.querySelector('.tab-content .swiper-wrapper')
        || section.querySelector('.proudct-list .swiper-wrapper')
        || section.querySelector('.tab-content .row');
      if (!grid) continue;

      /* 只处理我们认识的 tab */
      var known = [];
      for (var t = 0; t < tabButtons.length; t++) {
        if (HOME_TABS[tabButtons[t].getAttribute('title')]) known.push(tabButtons[t]);
      }
      if (!known.length) continue;

      var template = grid.querySelector('.swiper-slide');
      if (!template) continue;
      var templateClone = template.cloneNode(true);
      var origSlides = grid.innerHTML;

      (function (section, grid, templateClone, origSlides, tabButtons) {
        function setActive(btn) {
          for (var i = 0; i < tabButtons.length; i++) {
            var slide = tabButtons[i].closest('.swiper-slide');
            if (!slide) continue;
            slide.classList.remove('active', 'swiper-slide-active');
          }
          var target = btn.closest('.swiper-slide');
          if (target) target.classList.add('active', 'swiper-slide-active');
        }

        function renderList(skus) {
          var cards = TAB_DATA.cards || {};
          var sampleCol = templateClone;
          grid.innerHTML = '';
          var n = 0;
          for (var i = 0; i < skus.length && n < 30; i++) {
            var d = cards[skus[i]];
            if (!d) continue;
            var el = sampleCol.cloneNode(true);
            var item = el.querySelector('.item') || el;
            /* 链接 */
            var links = el.querySelectorAll('a[href*="/vi-nsg/product/"]');
            for (var li = 0; li < links.length; li++) links[li].setAttribute('href', d.u);
            var nameEl = el.querySelector('.field-name a');
            if (nameEl) { nameEl.textContent = d.n; nameEl.setAttribute('title', d.n); }
            /* 图片 */
            var span = el.querySelector('.field-img span');
            if (span) {
              span.style.backgroundImage = "url('" + d.i + "')";
              span.style.backgroundSize = 'cover';
              span.style.backgroundPosition = 'center center';
              span.style.backgroundRepeat = 'no-repeat';
            }
            /* 价格 */
            var oldP = el.querySelector('.field-price-old');
            if (oldP && oldP.parentNode) {
              var holder = oldP.parentNode;
              var keep = holder.querySelector('.field-price');
              if (keep) keep.remove();
              oldP.remove();
              holder.insertAdjacentHTML('afterbegin',
                '<div class="field-price-old ">' + money(d.o) + '</div>'
                + '<div class="field-price "><span class="lbl-discount"><strong>Giảm giá</strong>-50%</span><span>' + money(d.p) + '</span></div>');
            }
            grid.appendChild(el);
            n++;
          }
          if (n === 0) grid.innerHTML = origSlides;
        }

        for (var k = 0; k < tabButtons.length; k++) {
          (function (btn) {
            var title = btn.getAttribute('title');
            var cfg = HOME_TABS[title];
            if (!cfg) return;
            btn.addEventListener('click', function (e) {
              e.preventDefault();
              setActive(btn);
              if (cfg.type === 'none') { grid.innerHTML = origSlides; return; }
              loadTabData().then(function () {
                var skus = skusForTab(cfg);
                if (skus.length) renderList(skus);
                else grid.innerHTML = origSlides;
              }).catch(function () { grid.innerHTML = origSlides; });
            });
          })(tabButtons[k]);
        }
      })(section, grid, templateClone, origSlides, tabButtons);

      bound++;
    }
    return bound;
  }

  function boot() {
    loadCatalog().then(function () {
      applyMobileBanners();
      // 内联骨架只带 sku/qty/price，名字和图从 catalog 补齐（首次进站时）
      var cur = readCart();
      var enriched = false;
      for (var i = 0; i < cur.length; i++) {
        if (!cur[i].name && CATALOG && CATALOG.map[cur[i].sku]) {
          var cp = CATALOG.map[cur[i].sku];
          cur[i].name = cp.name;
          cur[i].image = cp.image || cp.thumb || '';
          cur[i].url = cp.url || cur[i].url || '';
          enriched = true;
        }
      }
      if (enriched) {
        try { localStorage.setItem(CART_KEY, JSON.stringify(cur)); } catch (e) {}
        syncCart(cur);
        renderHeaderBadge(cur);
        renderPage();
      }
    });
    var items = readCart();
    writeCartCookie(items); // 让下次加载时内联骨架能还原同一份购物车
    syncCart(items);
    renderHeaderBadge(items);
    renderPage();

    /* 分类页：接上「Xem thêm」分页（从本地 cat-index + card-data 续载） */
    if (/^\/vi-nsg\/category\//.test(location.pathname)) {
      try { bindCategoryLoadMore(); } catch (e) { console.error('[loadmore]', e && e.stack || e); }
    }

    /* 首页/专题页：区块 tab 切换（Mua Gì Hôm Nay 等） */
    try { bindHomeTabs(); } catch (e) { console.error('[hometabs]', e && e.stack || e); }

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
    bindSwipers();
    bindDropdowns();
    bindMobileCarousels();
    if (path === '/') {
      bindWelcomePopup();
      // 促销弹窗晚 800ms 出现，别抢首屏渲染
      setTimeout(bindPromoPopup, 800);
    }
    if (path === '/checkout') bindCheckout();
    if (path === '/search') renderSearchPage();
    if (path.indexOf('/vi-nsg/product/') === 0) {
      bindProductPage();
      renderProductFromData();
    }
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
