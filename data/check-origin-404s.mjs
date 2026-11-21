const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0';
const HOST = 'https://www.lottemart.vn';

const cases = [
  '/vi-nsg/product/andros-frozen-strawberry-300g-8935282905847-p49031',
  '/vi-nsg/product/trai-mong-do-andros-hop-600g-8935282907407-p48940',
  '/vi-nsg/product/andros-frozen-blueberry-300g-8935282905878-p49032',
  '/vi-nsg/product/combo-goi-xa-pantene-collagen-phuc-hoi-biotin-3-phut-dieu-ky-500ml-480ml-cbpantene89589305-p239550',
  '/vi-nsg/tp1/qua-tang-dac-san',
  '/vi-nsg/promotion',
  '/vi-nsg/tp7/cach-lam-nem-chay-van-dau',
  '/vi-nsg/tp1/cham-soc-be',
  '/vi-nsg/tp1/sinh-nhat',
  '/vi-nsg/pickup-instruction-and-guideline',
];

for (const p of cases) {
  let code = 'ERR', size = 0;
  try {
    const res = await fetch(HOST + p, { headers: { 'user-agent': UA }, redirect: 'follow' });
    code = res.status;
    const t = await res.text();
    size = t.length;
  } catch (e) { code = 'ERR'; }
  console.log(`${String(code).padEnd(5)} ${String(size).padStart(8)}B   ${p}`);
}
