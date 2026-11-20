/* [ltm-clone] LOTTE Mart Vietnam — storefront clone (sandbox fixture)
 * visual reference: https://www.lottemart.vn/ (snapshot 2026-11-20)
 * for internal testing / demo use only — not affiliated with LOTTE Mart
 */

/** GET /api/cart —— 与 window.__BP_CART__ 同构（契约 §5.2） */
const CURRENCY = 'VND';
const LOCALE = 'vi';

const fmt = (minor) =>
  new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(minor || 0) + ' ₫';

export const onRequestGet = ({ request }) => {
  const cookie = request.headers.get('cookie') || '';
  const m = cookie.match(/bp_oid=([^;]+)/);
  const orderNumber = m ? decodeURIComponent(m[1]) : 'LTM-' + Date.now().toString(36).toUpperCase();

  const body = JSON.stringify({
    order_number: orderNumber,
    currency: CURRENCY,
    total: 0,
    total_amount: fmt(0),
    items: [],
    locale: LOCALE,
  });

  return new Response(body, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...(m ? {} : { 'set-cookie': `bp_oid=${orderNumber}; Path=/; Max-Age=604800; SameSite=Lax` }),
    },
  });
};
