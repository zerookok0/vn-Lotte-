import { readFile } from 'node:fs/promises';
const raw = JSON.parse(await readFile(new URL('./raw/homepage.json', import.meta.url), 'utf8'));
const data = raw.data;

console.log('=== zones ===');
data.forEach((z, i) => {
  const keys = Object.keys(z);
  const arrKeys = keys.filter(k => Array.isArray(z[k]));
  console.log(`[${i}] zone=${z.zone ?? '-'} keys=[${keys.join(', ')}] arrays=${arrKeys.map(k => `${k}:${z[k].length}`).join(' ')}`);
});

// 找商品数组
const prodZone = data.find(z => (z.product_list || z.product || z.product_data)?.length);
if (prodZone) {
  console.log('\n=== product array keys ===', Object.keys(prodZone));
  const list = prodZone.product_list || prodZone.product || prodZone.product_data;
  console.log('first product keys:', Object.keys(list[0]));
  console.log('\nfirst product:');
  console.log(JSON.stringify(list[0], null, 2).slice(0, 2500));
}

// banner zone
const bannerZone = data.find(z => (z.banner_list || z.banners)?.length);
if (bannerZone) {
  console.log('\n=== banner zone keys ===', Object.keys(bannerZone));
  const bl = bannerZone.banner_list || bannerZone.banners;
  console.log('banner count:', bl.length);
  console.log(JSON.stringify(bl[0], null, 2));
}
