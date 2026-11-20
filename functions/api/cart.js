/* [ltm-clone] LOTTE Mart Vietnam — storefront clone (sandbox fixture)
 * visual reference: https://www.lottemart.vn/ (snapshot 2026-11-20)
 * for internal testing / demo use only — not affiliated with LOTTE Mart
 */

/**
 * GET /api/cart —— 与 window.__BP_CART__ 同构（契约 §5.2）
 *
 * ⚠️ 必须读 ltm_cart cookie（sku:qty:price,...）。
 * connector 的 getCart() 拿到页面骨架后还会调一次这个接口覆盖 cartCache，
 * 如果这里返回空购物车，页面上算好的金额会被冲成 0，提交时 amount=0 直接被拒。
 */
const CURRENCY = 'VND';
const LOCALE = 'vi';

const fmt = (minor) =>
  new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(minor || 0) + ' ₫';

function readCookie(cookieHeader, name) {
  const m = String(cookieHeader || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : '';
}

export const onRequestGet = ({ request }) => {
  const cookie = request.headers.get('cookie') || '';
  const orderNumber = readCookie(cookie, 'bp_oid') || 'LTM-' + Date.now().toString(36).toUpperCase();

  const raw = readCookie(cookie, 'ltm_cart');
  const items = [];
  let total = 0;
  if (raw) {
    for (const seg of raw.split(',').slice(0, 50)) {
      const [sku, qtyStr, priceStr] = seg.split(':');
      if (!sku) continue;
      const qty = parseInt(qtyStr, 10) || 1;
      const price = parseInt(priceStr, 10) || 0;
      items.push({ sku, name: '', qty, price });
      total += price * qty;
    }
  }

  const body = JSON.stringify({
    order_number: orderNumber,
    currency: CURRENCY,
    total,
    total_amount: fmt(total),
    items,
    locale: LOCALE,
  });

  return new Response(body, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...(readCookie(cookie, 'bp_oid') ? {} : { 'set-cookie': `bp_oid=${orderNumber}; Path=/; Max-Age=604800; SameSite=Lax` }),
    },
  });
};
