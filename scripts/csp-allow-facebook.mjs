import { readFile, writeFile } from 'node:fs/promises';

/* 在 CSP 里放行 Facebook Pixel：
   script-src  + https://connect.facebook.net
   connect-src + https://www.facebook.com https://connect.facebook.net
   img-src 已经是 https: 全覆盖，noscript 的 img 没问题 */

const FILES = ['server.mjs', 'worker/index.js', 'public/_headers'];
const SCRIPT_OLD = `"script-src 'self' 'unsafe-inline'"`;
const SCRIPT_NEW = `"script-src 'self' 'unsafe-inline' https://connect.facebook.net"`;
const CONNECT_OLD = `wss://\${PANEL_DOMAIN}\``;
const CONNECT_NEW = `wss://\${PANEL_DOMAIN} https://www.facebook.com https://connect.facebook.net\``;

for (const f of FILES) {
  let s = await readFile(f, 'utf8');
  const before = s;

  if (f === 'public/_headers') {
    s = s.replace(
      "script-src 'self' 'unsafe-inline';",
      "script-src 'self' 'unsafe-inline' https://connect.facebook.net;",
    );
    s = s.replace(
      'wss://annangourmet.makeup;',
      'wss://annangourmet.makeup https://www.facebook.com https://connect.facebook.net;',
    );
  } else {
    s = s.replace(SCRIPT_OLD, SCRIPT_NEW);
    s = s.replace(CONNECT_OLD, CONNECT_NEW);
  }

  if (s === before) { console.log(`${f}: NO CHANGE`); continue; }
  await writeFile(f, s, 'utf8');
  console.log(`${f}: patched`);
}

/* 复核 */
for (const f of FILES) {
  const s = await readFile(f, 'utf8');
  const hasScript = s.includes('script-src') && s.includes('https://connect.facebook.net');
  const hasConn = s.includes('https://www.facebook.com');
  console.log(`  ${f.padEnd(20)} script-src:${hasScript}  connect(facebook.com):${hasConn}`);
}
