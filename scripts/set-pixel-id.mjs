/**
 * 填 Facebook Pixel ID 并推上线
 *   node scripts/set-pixel-id.mjs 123456789012345
 *
 * 会做三件事：
 *   1. 把 checkout.html 里的 YOUR_PIXEL_ID 换成你的 ID
 *   2. 同步 public/ 与 build/r2-site/ 两份
 *   3. 上传到 R2（需要 CLOUDFLARE_API_TOKEN 环境变量）
 */
import { readFile, writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

const id = String(process.argv[2] || '').trim();

if (!/^\d{10,20}$/.test(id)) {
  console.error('用法: node scripts/set-pixel-id.mjs <PixelID>');
  console.error('Pixel ID 是 15–16 位纯数字，在 Facebook 事件管理里复制。');
  process.exit(1);
}

const PLACEHOLDER = 'YOUR_PIXEL_ID';
const FILES = ['public/checkout.html', 'build/r2-site/checkout.html'];

let changed = 0;
for (const f of FILES) {
  let s = await readFile(f, 'utf8');
  if (!s.includes(PLACEHOLDER)) {
    console.log(`${f}: 没有占位符（可能已填过）`);
    continue;
  }
  const n = (s.match(new RegExp(PLACEHOLDER, 'g')) || []).length;
  s = s.split(PLACEHOLDER).join(id);
  await writeFile(f, s, 'utf8');
  console.log(`${f}: 替换 ${n} 处 -> ${id}`);
  changed++;
}

if (!changed) {
  console.log('\n没有可替换的占位符，退出。');
  process.exit(0);
}

/* 上传到 R2 */
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) {
  console.log('\n⚠️  未设置 CLOUDFLARE_API_TOKEN，只改了本地文件。');
  console.log('   设置环境变量后重跑，或手动执行：');
  console.log('   npx wrangler r2 object put vn-lotte/checkout.html --file=build/r2-site/checkout.html --content-type=text/html --remote');
  process.exit(0);
}

console.log('\n上传 checkout.html 到 R2 ...');
try {
  const out = execSync(
    'npx wrangler r2 object put vn-lotte/checkout.html --file=build/r2-site/checkout.html --content-type=text/html --remote',
    { encoding: 'utf8', stdio: 'pipe', env: process.env },
  );
  console.log(out.split('\n').filter((l) => /Upload complete|error/i.test(l)).join('\n') || 'ok');
} catch (e) {
  console.error('上传失败:', String(e.stdout || e.message).slice(0, 200));
  process.exit(1);
}

console.log(`\n完成。打开 https://你的域名/checkout ，控制台执行：`);
console.log(`  BPConnector.pixel.state()`);
console.log(`  // 期望看到 last.sent: ["fb"]`);
