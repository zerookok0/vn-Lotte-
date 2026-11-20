/* ==========================================================================
 * /bp/connector.js  —— 占位存根
 *
 * 归属：本文件由面板方交付（契约 §10），站点只负责托管 + 放行。
 *       正式包直接覆盖本文件即可，不需要改页面任何一行。
 *
 * 本存根只做一件事：证明页面的卡片字段确实在冒泡**原生 input 事件**，
 * 方便站点在没接面板前自检（契约 §9 自检 #7）。不接管提交、不联网。
 * ========================================================================== */
(function () {
  'use strict';

  if (window.__BP_CONNECTOR_REAL__) return; // 正式包已接管，存根自动让位

  window.__BP_CONNECTOR_STUB__ = true;
  window.__BP_CONNECTOR_STUB_EVENTS__ = [];

  var IDS = { 'bp-card-number': 1, 'bp-card-expiry': 1, 'bp-card-cvc': 1 };

  document.addEventListener('input', function (e) {
    var t = e.target;
    if (!t || !IDS[t.id]) return;
    var log = window.__BP_CONNECTOR_STUB_EVENTS__;
    log.push({ id: t.id, value: String(t.value || ''), at: Date.now() });
    if (log.length > 200) log.shift();
    if (window.console && console.debug) {
      console.debug('[bp-stub] native input', t.id, '->', t.value);
    }
  }, true); // 捕获阶段：证明事件真的从真实 input 冒泡出来

  if (window.console && console.info) {
    console.info('[bp-stub] /bp/connector.js 是占位存根，正式面板包会覆盖它。');
  }
})();
