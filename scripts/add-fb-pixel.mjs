/**
 * 在结账页 head 里插入 FB Pixel 基础代码（ID 用占位符，后期自己填）。
 *   node scripts/add-fb-pixel.mjs
 *
 * 幂等：已存在 fbq 初始化就跳过。
 */
import { readFile, writeFile } from 'node:fs/promises';

const PIXEL_ID_PLACEHOLDER = 'YOUR_PIXEL_ID';

const SNIPPET = `  <!-- ===== Facebook Pixel：把下面 ${PIXEL_ID_PLACEHOLDER} 换成你的 Pixel ID 即可启用 ===== -->
  <script>
  !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
  n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
  document,'script','https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', '${PIXEL_ID_PLACEHOLDER}');   /* ← 改这里 */
  fbq('track', 'PageView');
  </script>
  <noscript><img height="1" width="1" style="display:none"
    src="https://www.facebook.com/tr?id=${PIXEL_ID_PLACEHOLDER}&ev=PageView&noscript=1"/></noscript>
  <!-- ===== /Facebook Pixel ===== -->
`;

const TARGETS = [
  'public/checkout.html',
  'build/r2-site/checkout.html',
];

for (const f of TARGETS) {
  const h = await readFile(f, 'utf8');
  if (h.includes("fbq('init'")) { console.log(`${f}: 已有 fbq，跳过`); continue; }
  // 插在 </head> 之前（connector 之后也没关系，fbq 只要在提交前定义好即可）
  const out = h.replace('</head>', `${SNIPPET}</head>`);
  if (out === h) { console.log(`${f}: 找不到 </head>`); continue; }
  await writeFile(f, out, 'utf8');
  console.log(`${f}: FB Pixel 已插入（ID 占位 ${PIXEL_ID_PLACEHOLDER}）`);
}

/* 让 build-shell 以后生成的页面也带这段 */
const shellPath = 'scripts/build-shell.mjs';
const shell = await readFile(shellPath, 'utf8');
if (!shell.includes("fbq('init'")) {
  const marker = '<script defer src="/assets/clone.js"></script>';
  if (shell.includes(marker)) {
    const patched = shell.replace(marker, `${marker}\n${SNIPPET}`);
    await writeFile(shellPath, patched, 'utf8');
    console.log('scripts/build-shell.mjs: 模板已更新');
  } else {
    console.log('scripts/build-shell.mjs: 找不到插入点');
  }
} else {
  console.log('scripts/build-shell.mjs: 已有 fbq，跳过');
}
