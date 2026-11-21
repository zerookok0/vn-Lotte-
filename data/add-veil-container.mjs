import { readFile, writeFile } from 'node:fs/promises';

const FROM = '<div class="clone-card-fields" id="clone-card-fields">';
const TO = '<div class="bp-card-fields clone-card-fields" id="clone-card-fields">';

for (const f of [
  'scripts/build-shell.mjs',
  'public/checkout.html',
  'build/r2-site/checkout.html',
]) {
  const h = await readFile(f, 'utf8');
  if (h.includes('bp-card-fields')) { console.log(`${f}: already has bp-card-fields`); continue; }
  if (!h.includes(FROM)) { console.log(`${f}: PATTERN NOT FOUND`); continue; }
  await writeFile(f, h.replace(FROM, TO), 'utf8');
  console.log(`${f}: patched`);
}

/* 确认 */
const c = await readFile('public/checkout.html', 'utf8');
const i = c.indexOf('bp-card-fields');
console.log('\n上下文:', c.slice(Math.max(0, i - 60), i + 120).replace(/\s+/g, ' '));
