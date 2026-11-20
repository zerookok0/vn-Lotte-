/* [ltm-clone] LOTTE Mart Vietnam — storefront clone (sandbox fixture)
 * visual reference: https://www.lottemart.vn/ (snapshot 2026-11-20)
 * for internal testing / demo use only — not affiliated with LOTTE Mart
 */

/**
 * POST /api/checkout（契约 §6）
 *  - 永远 200 + JSON，绝不 302/303
 *  - 单号复用：返回的 order_number === 请求里的
 *  - 幂等：同号重放返回同一响应
 *  - 不接收卡片数据（卡片只走 /bp/ 通道）
 */

/** Cloudflare KV / D1 更稳；这里用模块级 Map 演示，单 isolate 有效 */
const DONE = new Map();

const json = (o) =>
  new Response(JSON.stringify(o), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export const onRequestPost = async ({ request }) => {
  let body = null;
  try { body = await request.json(); } catch { body = null; }

  const fail = (code, message) => json({ ok: false, error_code: code, message });

  if (!body || typeof body !== 'object') return fail('bad_request', 'Dữ liệu không hợp lệ.');
  if (typeof body.order_number !== 'string' || !body.order_number) return fail('bad_request', 'Thiếu mã đơn hàng.');
  if (!Number.isInteger(body.amount) || body.amount <= 0) return fail('invalid_amount', 'Giá trị đơn hàng không hợp lệ.');

  const c = body.customer || {};
  // connector 提交 firstname/lastname/address1；站点表单提交 name/addr —— 两种都认
  const fullName = String(c.name || [c.firstname, c.lastname].filter(Boolean).join(' ') || '').trim();
  const addr = String(c.addr || c.address1 || c.address || '').trim();
  const email = String(c.email || '').trim();
  const phone = String(c.phone || c.tel || c.mobile || '').trim();

  if (!fullName) return fail('invalid_name', 'Vui lòng nhập họ tên.');
  if (!email.includes('@')) return fail('invalid_email', 'Email không hợp lệ.');
  if (!phone) return fail('invalid_phone', 'Vui lòng nhập số điện thoại.');
  if (!addr) return fail('invalid_addr', 'Vui lòng nhập địa chỉ.');

  // 便于联调失败分支
  if (/decline/i.test(email)) {
    return fail('card_declined', 'Thanh toán không thành công, vui lòng thử thẻ khác.');
  }

  const key = body.order_number;
  if (DONE.has(key)) return json(DONE.get(key));

  const result = { ok: true, order_number: key };
  DONE.set(key, result);

  console.log('[checkout]', key, body.amount, body.currency, (body.items || []).length);
  return json(result);
};
