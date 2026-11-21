const BASE = 'https://vn-lotte.mating.workers.dev';
const UPLOADER = 'https://vn-lotte-uploader.mating.workers.dev';
const KEY = 'u7K2pQx9Lm4Rn8Ts3Vw6Yz1Bc5Df0Gh';

console.log('=== uploader ===');
try {
  const p = await fetch(UPLOADER + '/ping');
  console.log('  /ping:', p.status, await p.text());
  const s = await fetch(UPLOADER + '/stats', { headers: { 'x-upload-key': KEY } });
  console.log('  /stats:', await s.text());
} catch (e) {
  console.log('  uploader ERR:', String(e).slice(0, 80));
}

console.log('\n=== 线上首页 top-nav ===');
try {
  const res = await fetch(BASE + '/');
  const h = await res.text();
  const i = h.indexOf('nav-content');
  const seg = h.slice(i, i + 1600);
  const re = /<a href="([^"]*)" title="([^"]*)" class="d-flex/g;
  let m;
  let n = 0;
  while ((m = re.exec(seg)) && n < 10) {
    console.log(`  ${m[1].padEnd(46)} ${m[2]}`);
    n++;
  }
  console.log(`  （共 ${n} 项）`);
} catch (e) {
  console.log('  ERR:', String(e).slice(0, 80));
}

console.log('\n=== 线上商品页 top-nav ===');
try {
  const res = await fetch(BASE + '/vi-nsg/product/chanh-khong-hat-500g-8935268200836-p228894');
  const h = await res.text();
  const i = h.indexOf('nav-content');
  const seg = h.slice(i, i + 1600);
  const re = /<a href="([^"]*)" title="([^"]*)" class="d-flex/g;
  let m;
  let n = 0;
  while ((m = re.exec(seg)) && n < 10) {
    console.log(`  ${m[1].padEnd(46)} ${m[2]}`);
    n++;
  }
} catch (e) {
  console.log('  ERR:', String(e).slice(0, 80));
}
