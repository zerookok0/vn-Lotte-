import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const files = [
  ['契约', 'F:/DSH/项目/fake/建站结账页契约.md', 'F:/DSH/项目/fake/data/incoming3/../incoming3/../建站结账页契约_new.md'],
];

/* 直接对两份契约做行级 diff */
const oldMd = await readFile('F:/DSH/项目/fake/建站结账页契约.md', 'utf8');
const newMd = await readFile('C:/Users/Admin/Desktop/建站结账页契约.md', 'utf8');

const a = oldMd.split('\n');
const b = newMd.split('\n');

console.log(`旧契约 ${a.length} 行 / ${oldMd.length} 字节`);
console.log(`新契约 ${b.length} 行 / ${newMd.length} 字节\n`);

/* 简单 LCS diff */
const n = a.length, m = b.length;
const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
for (let i = n - 1; i >= 0; i--) {
  for (let j = m - 1; j >= 0; j--) {
    dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
}
const ops = [];
let i = 0, j = 0;
while (i < n && j < m) {
  if (a[i] === b[j]) { i++; j++; }
  else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push(['-', i + 1, a[i]]); i++; }
  else { ops.push(['+', j + 1, b[j]]); j++; }
}
while (i < n) { ops.push(['-', i + 1, a[i]]); i++; }
while (j < m) { ops.push(['+', j + 1, b[j]]); j++; }

console.log(`差异行数: ${ops.length}\n=== 新增/修改内容 ===`);
let shown = 0;
for (const [op, ln, text] of ops) {
  if (op === '+' && text.trim()) {
    console.log(`  +${ln}  ${text.slice(0, 200)}`);
    if (++shown > 80) { console.log('  ...(截断)'); break; }
  }
}
if (!shown) console.log('  (无新增)');
