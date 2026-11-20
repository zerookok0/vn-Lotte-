import { readFile } from 'node:fs/promises';

const h = await readFile('public/index.html', 'utf8');
const urls = [...h.matchAll(/https?:\/\/[^"'\\\s)<>]+/g)].map((m) => m[0]);
const hosts = {};
for (const u of urls) { try { const x = new URL(u); hosts[x.host] = (hosts[x.host] || 0) + 1; } catch {} }
console.log('external hosts:');
console.log(hosts);
console.log('\nscript tags left:', (h.match(/<script\b/gi) || []).length);
console.log('size KB:', (h.length / 1024).toFixed(0));
console.log('\nsample external urls:');
urls.filter((u) => !u.includes('www.lottemart.vn') && !u.startsWith('/')).slice(0, 12).forEach((u) => console.log('  ' + u.slice(0, 120)));
