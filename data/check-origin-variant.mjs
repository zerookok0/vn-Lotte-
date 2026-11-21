import { writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0';
const urls = [
  'https://www.lottemart.vn/vi-nsg/product/bot-an-dam-ridielac-gold-heo-ca-rot-200g-8934673424035-8934673424035-p7104',
  'https://www.lottemart.vn/vi-nsg/product/bad-ridielac-gold-heo-ca-rot-hg-200g-8934673400718-8934673400718-p238694',
];

for (const u of urls) {
  console.log(`\n=== ${u.split('/').pop()} ===`);
  const out = execSync(
    `curl.exe -sS -o NUL -w "code=%{http_code} redirect=%{redirect_url} final=%{url_effective}" -A "${UA}" "${u}" --max-time 30`,
    { encoding: 'utf8' },
  ).trim();
  console.log('  ' + out);

  const res = await fetch(u, { headers: { 'user-agent': UA } });
  const html = await res.text();
  const title = (html.match(/<title>([^<]*)/) || [])[1] || '';
  const canonical = (html.match(/rel="canonical"\s+href="([^"]*)"/) || [])[1] || '(none)';
  const ogUrl = (html.match(/property="og:url"\s+content="([^"]*)"/) || [])[1] || '(none)';
  console.log('  final status:', res.status, '| redirected:', res.redirected);
  console.log('  title:', title);
  console.log('  canonical:', canonical);
  console.log('  og:url:', ogUrl);

  const skus = [...new Set([...html.matchAll(/(\d{13})/g)].map((m) => m[1]))].slice(0, 5);
  console.log('  页面里的 13 位数字:', skus.join(', '));
}
