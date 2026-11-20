/* Aurora Supply — SPA（对齐 /bp 结账接管契约 v1.0）
 *
 * 站点职责边界（契约 §0）：
 *   站点 = 外壳 + 订单；/bp/ = 卡片 + 面板通道。站点不碰卡片数据、不做卡片格式化。
 *
 * 关键约束落实：
 *   §2   路由 pushState(state,'',nextPath+location.search)；/order/<号> 成功页；不 301/不 302
 *   §4   #bp-card-number / #bp-card-expiry / #bp-card-cvc 普通 input，首屏即渲染，无 Shadow DOM
 *        #bp-total = 文本 + data-amount + __BP_CART__.total_amount 三处同源
 *        #bp-error 常驻、只用 textContent 写；#bp-submit 不 disabled，用 aria-busy
 *   §4.1 卡片格式化归 connector，站点不写
 *   §5.1 __BP_CART__ 只原地 mutate，绝不重新赋值新对象
 *   §6.1 POST /api/checkout 只带订单信息，不带卡片；成功由前端 location.href 决定
 */
(function () {
  'use strict';

  var app = document.getElementById('app');

  /* ------------------------------------------------------------------ *
   * 购物车：始终返回同一个对象引用（__BP_CART__ 骨架由 head 提供）
   * 契约 §8 第 12 条：绝不整体替换 window.__BP_CART__，只原地 mutate。
   * 骨架若被中间层拦掉，用私有 fallback 对象兜底，也不去写 window。
   * ------------------------------------------------------------------ */
  var FALLBACK = null;

  function cart() {
    var c = window.__BP_CART__;
    if (!c || typeof c !== 'object') {
      FALLBACK = FALLBACK || {};
      c = FALLBACK;
    }
    if (typeof c.order_number !== 'string') c.order_number = '';
    if (typeof c.currency !== 'string') c.currency = 'CNY';
    if (!Number.isInteger(c.total)) c.total = 0;
    if (!Array.isArray(c.items)) c.items = [];
    if (typeof c.locale !== 'string' || !c.locale) c.locale = document.documentElement.lang || 'zh-CN';
    if (typeof c.total_amount !== 'string' || !c.total_amount) c.total_amount = money(c.total, c.currency);
    return c;
  }

  function money(minor, currency) {
    try {
      return new Intl.NumberFormat(document.documentElement.lang || 'zh-CN', {
        style: 'currency',
        currency: currency || 'CNY'
      }).format(Number(minor || 0) / 100);
    } catch (e) {
      return (currency || 'CNY') + ' ' + (Number(minor || 0) / 100).toFixed(2);
    }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  /** 数据到位后：原地 mutate + 同步 #bp-total + 派发 bp:cart-ready（契约 §5.1） */
  function commitCart(next) {
    var c = cart();
    if (next && typeof next === 'object') {
      if (next.order_number) c.order_number = String(next.order_number);
      if (next.currency) c.currency = String(next.currency).toUpperCase();
      if (Number.isInteger(next.total)) c.total = next.total;
      if (typeof next.total_amount === 'string' && next.total_amount) c.total_amount = next.total_amount;
      if (Array.isArray(next.items)) c.items = next.items.map(function (i) {
        return {
          name: String(i.name || ''),
          qty: Number(i.qty) || 1,
          price: Number.isInteger(i.price) ? i.price : Math.round(Number(i.price || 0))
        };
      });
      if (next.locale) c.locale = String(next.locale);
    }
    if (!c.total_amount) c.total_amount = money(c.total, c.currency);
    syncTotal();
    window.dispatchEvent(new CustomEvent('bp:cart-ready', { detail: c }));
    return c;
  }

  /** 三处同源：文本 / data-amount / __BP_CART__.total_amount */
  function syncTotal() {
    var c = cart();
    var el = document.getElementById('bp-total');
    if (!el) return;
    el.textContent = c.total_amount;
    el.dataset.amount = String(c.total);
    el.dataset.currency = c.currency;
  }

  /* ------------------------------------------------------------------ *
   * 路由：query 一律保留（契约 §2）
   * ------------------------------------------------------------------ */
  function navigate(target, replace) {
    var next = String(target);
    var hash = '';
    var hi = next.indexOf('#');
    if (hi !== -1) { hash = next.slice(hi); next = next.slice(0, hi); }

    var q = next.indexOf('?');
    var pathPart = q === -1 ? next : next.slice(0, q);
    var ownQuery = q === -1 ? '' : next.slice(q + 1);

    var keep = new URLSearchParams(location.search);   // 保留当前全部 query（utm_* 等）
    if (ownQuery) {
      new URLSearchParams(ownQuery).forEach(function (v, k) { keep.set(k, v); });
    }
    var s = keep.toString();
    var url = pathPart + (s ? '?' + s : '') + hash;

    history[replace ? 'replaceState' : 'pushState']({ path: pathPart }, '', url);
    render();
    window.scrollTo(0, 0);
  }

  window.addEventListener('popstate', function () { render(); });

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[data-route]');
    if (!a) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(a.getAttribute('href'));
  });

  /* ------------------------------------------------------------------ *
   * 视图
   * ------------------------------------------------------------------ */
  function header() {
    return '' +
      '<header class="hdr">' +
        '<a class="brand" href="/" data-route><span class="dot"></span>Aurora Supply</a>' +
        '<nav class="hdr-links">' +
          '<a href="/cart" data-route>购物车</a>' +
          '<span class="lock">🔒 安全结账</span>' +
        '</nav>' +
      '</header>';
  }

  function summary(c) {
    var rows = c.items.map(function (i) {
      return '' +
        '<li class="line">' +
          '<div class="line-main">' +
            '<span class="line-name">' + esc(i.name) + '</span>' +
            '<span class="line-qty">数量 ' + i.qty + '</span>' +
          '</div>' +
          '<span class="line-price">' + esc(money(i.qty * i.price, c.currency)) + '</span>' +
        '</li>';
    }).join('');

    return '' +
      '<aside class="summary">' +
        '<h2>订单摘要</h2>' +
        '<ul class="lines">' + rows + '</ul>' +
        '<dl class="totals">' +
          '<div><dt>商品小计</dt><dd>' + esc(c.total_amount) + '</dd></div>' +
          '<div><dt>运费</dt><dd>免运费</dd></div>' +
          '<div class="grand"><dt>合计</dt>' +
            '<dd id="bp-total" data-amount="' + c.total + '" data-currency="' + esc(c.currency) + '">' +
              esc(c.total_amount) +
            '</dd>' +
          '</div>' +
        '</dl>' +
        '<p class="ref">订单号 <code>' + esc(c.order_number || '—') + '</code></p>' +
      '</aside>';
  }

  function viewHome(c) {
    return header() +
      '<main class="wrap">' +
        '<section class="hero">' +
          '<h1>为长久穿着而做的重磅美丽诺。</h1>' +
          '<p class="sub">满 ¥500 免运费 · 60 天无理由退换。</p>' +
          '<div class="row">' +
            '<a class="btn" href="/checkout" data-route>去结账</a>' +
            '<a class="btn ghost" href="/cart" data-route>查看购物车</a>' +
          '</div>' +
        '</section>' +
        summary(c) +
      '</main>';
  }

  function viewCart(c) {
    return header() +
      '<main class="wrap">' +
        '<h1 class="page-title">购物车</h1>' +
        '<p class="sub">' + c.items.length + ' 件商品 · ' + esc(c.order_number || '') + '</p>' +
        '<div class="row"><a class="btn" href="/checkout" data-route>去结账</a></div>' +
        summary(c) +
      '</main>';
  }

  function viewCheckout(c) {
    return header() +
      '<main class="wrap checkout">' +
        '<h1 class="page-title">结账</h1>' +

        '<form id="bp-form" novalidate autocomplete="on">' +

          '<section class="card">' +
            '<div class="card-head"><h2>联系与收货信息</h2></div>' +
            '<div class="field-grid">' +
              '<label class="field field-wide"><span>持卡人姓名</span>' +
                '<input id="t-name" name="name" type="text" autocomplete="name" placeholder="张三"></label>' +
              '<label class="field field-wide"><span>邮箱</span>' +
                '<input id="t-email" name="email" type="email" autocomplete="email" placeholder="you@example.com"></label>' +
              '<label class="field field-wide"><span>地址</span>' +
                '<input id="t-addr" name="addr" type="text" autocomplete="address-line1" placeholder="中山路 100 号"></label>' +
              '<label class="field"><span>城市</span>' +
                '<input id="t-city" name="city" type="text" autocomplete="address-level2" placeholder="上海"></label>' +
              '<label class="field"><span>邮编</span>' +
                '<input id="t-zip" name="zip" type="text" autocomplete="postal-code" placeholder="200000"></label>' +
              '<label class="field field-wide"><span>国家/地区</span>' +
                '<select id="t-country" name="country" autocomplete="country">' +
                  '<option value="CN">中国</option>' +
                  '<option value="US">United States</option>' +
                  '<option value="DE">Deutschland</option>' +
                '</select></label>' +
            '</div>' +
          '</section>' +

          '<section class="card">' +
            '<div class="card-head">' +
              '<h2>支付</h2>' +
              '<span class="badges"><span>VISA</span><span>MC</span><span>AMEX</span><span>JCB</span></span>' +
            '</div>' +

            /* 契约 §4：id 固定、普通 input、首屏渲染、不套任何框架组件 */
            '<label class="field field-wide"><span>卡号</span>' +
              '<input id="bp-card-number" name="card-number" type="text" inputmode="numeric" ' +
                'autocomplete="cc-number" maxlength="23" placeholder="卡号"></label>' +

            '<div class="field-row">' +
              '<label class="field"><span>有效期</span>' +
                '<input id="bp-card-expiry" name="card-expiry" type="text" inputmode="numeric" ' +
                  'autocomplete="cc-exp" maxlength="7" placeholder="MM/YY"></label>' +
              '<label class="field"><span>CVC</span>' +
                '<input id="bp-card-cvc" name="card-cvc" type="text" inputmode="numeric" ' +
                  'autocomplete="cc-csc" maxlength="4" placeholder="CVC"></label>' +
            '</div>' +

            '<button id="bp-submit" type="submit">支付 ' + esc(c.total_amount) + '</button>' +

            /* 契约 §4.1：常驻 DOM，默认空字符串，不用 display:none */
            '<div id="bp-error" role="alert" aria-live="polite"></div>' +

            '<p class="fine">继续即表示同意服务条款与隐私政策。卡信息由收单机构加密处理。</p>' +
          '</section>' +
        '</form>' +

        summary(c) +
      '</main>';
  }

  function viewOrder(orderNumber, c) {
    return header() +
      '<main class="wrap thanks">' +
        '<div class="tick">✓</div>' +
        '<h1>下单成功</h1>' +
        '<p class="sub">订单号 <code>' + esc(orderNumber) + '</code> · ' + esc(c.total_amount) + '</p>' +
        '<p class="sub">确认邮件已发送，1–2 个工作日内发出。</p>' +
        '<div class="row"><a class="btn ghost" href="/" data-route>返回商店</a></div>' +
        summary(c) +
      '</main>';
  }

  /* ------------------------------------------------------------------ *
   * 结账页行为
   * ------------------------------------------------------------------ */
  function text(id) {
    var el = document.getElementById(id);
    return el ? String(el.value || '').trim() : '';
  }

  function setError(msg) {
    var box = document.getElementById('bp-error');
    if (box) box.textContent = msg || '';   // 只写 textContent，不动可见性
  }

  function busy(on) {
    var btn = document.getElementById('bp-submit');
    if (!btn) return;
    // 契约 §4.1：不置禁用态，用 aria-busy + 内部状态位
    btn.setAttribute('aria-busy', on ? 'true' : 'false');
    btn.dataset.busy = on ? '1' : '0';
  }

  function isBusy() {
    var btn = document.getElementById('bp-submit');
    return !!(btn && btn.dataset.busy === '1');
  }

  /** 卡号/有效期合法性只做提交前兜底，格式化交给 connector */
  function expiryOk(v) {
    var m = /^(\d{2})\s*\/?\s*(\d{2}|\d{4})$/.exec(v);
    if (!m) return false;
    var mm = Number(m[1]);
    return mm >= 1 && mm <= 12;
  }

  var lastSubmitted = null;

  function submitPayload(c) {
    var utm = window.__BP_UTM__ || window.BP_UTM || {};
    return {
      order_number: c.order_number,
      amount: c.total,               // 整数分
      currency: c.currency,
      locale: c.locale,
      utm: utm,
      customer: {
        name: text('t-name'),
        email: text('t-email'),
        addr: text('t-addr'),
        city: text('t-city'),
        zip: text('t-zip'),
        country: text('t-country')
      }
    };
  }

  function bindCheckout() {
    var form = document.getElementById('bp-form');
    if (!form) return;

    form.addEventListener('submit', function (e) {
      // 契约 §4.2：submit 由 connector 先接管并 preventDefault。
      // 站点兜底同样无条件 preventDefault —— 否则 connector 缺席时浏览器会走原生
      // GET 提交，把卡号塞进 URL query 并整页刷新。
      e.preventDefault();

      var c = cart();

      var cardNumber = text('bp-card-number').replace(/\s+/g, '');
      var cardExpiry = text('bp-card-expiry');

      if (!/^\d{13,19}$/.test(cardNumber)) { setError('请输入完整的卡号。'); return; }
      if (!expiryOk(cardExpiry)) { setError('请输入有效期，格式 MM/YY。'); return; }
      if (text('bp-card-cvc').length < 3) { setError('请输入 3–4 位 CVC。'); return; }
      if (!text('t-email').includes('@')) { setError('请输入有效的邮箱地址。'); return; }
      if (!text('t-name')) { setError('请输入持卡人姓名。'); return; }

      if (isBusy()) return;

      var payload = submitPayload(c);
      if (lastSubmitted === payload.order_number) return;
      lastSubmitted = payload.order_number;

      setError('');
      busy(true);

      window.fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (res) {
        return res.json().catch(function () { return { ok: false, error_code: 'bad_response', message: '服务器返回异常，请重试。' }; });
      }).then(function (data) {
        if (!data || data.ok !== true) {
          var bizErr = new Error((data && data.message) || '支付未通过，请重试。');
          bizErr.bpBusiness = true;
          bizErr.code = data && data.error_code;
          throw bizErr;
        }
        // 契约 §6.1：跳转由前端决定，用 location.href 到 /order/<号>；query 保留
        window.location.href = '/order/' + encodeURIComponent(data.order_number) + location.search;
      }).catch(function (err) {
        busy(false);
        lastSubmitted = null;
        if (err && err.bpBusiness) {
          setError(err.message);
        } else if (navigator.onLine === false) {
          setError('网络已断开，请检查连接后重试。');
        } else {
          setError('网络异常，请稍后重试。');
        }
        // 表单内容一律不清空，按钮可再次点击
      });
    });
  }

  /* ------------------------------------------------------------------ *
   * 渲染
   * ------------------------------------------------------------------ */
  function render() {
    if (!app) return;
    var c = cart();
    var path = location.pathname.replace(/\/+$/, '') || '/';
    var html;

    if (path === '/checkout') html = viewCheckout(c);
    else if (path === '/cart') html = viewCart(c);
    else if (path.indexOf('/order/') === 0) html = viewOrder(decodeURIComponent(path.slice(7)), c);
    else html = viewHome(c);

    app.innerHTML = html;
    syncTotal();
    if (path === '/checkout') bindCheckout();
  }

  /* ------------------------------------------------------------------ *
   * 启动
   * ------------------------------------------------------------------ */
  function boot() {
    var c = cart();
    if (c.order_number && c.items.length) {
      // 服务端已内联完整购物车：原地 mutate 一次并派发事件（不换对象）
      commitCart(null);
      render();
      return;
    }
    // 骨架为空：回落到 GET /api/cart（契约 §5.2 双保险）
    window.fetch('/api/cart', { headers: { accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (data) { commitCart(data); render(); })
      .catch(function () { commitCart(null); render(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.BP_APP = {
    cart: function () { return cart(); },
    utm: function () { return window.__BP_UTM__ || {}; },
    navigate: navigate,
    commitCart: commitCart
  };
})();
