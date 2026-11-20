import { readFile } from 'node:fs/promises';

const raw = JSON.parse(await readFile(new URL('./raw/homepage.json', import.meta.url), 'utf8'));
const data = raw.data;

const shape = (v, d = 0) => {
  if (v === null) return 'null';
  if (Array.isArray(v)) return `Array(${v.length})` + (v.length && d < 2 ? `\n${'  '.repeat(d + 1)}[0] => ${shape(v[0], d + 1)}` : '');
  if (typeof v === 'object') {
    if (d > 3) return '{…}';
    return '{\n' + Object.entries(v).slice(0, 30).map(([k, x]) =>
      `${'  '.repeat(d + 1)}${k}: ${shape(x, d + 1)}`).join('\n') + '\n' + '  '.repeat(d) + '}';
  }
  if (typeof v === 'string') return `"${v.slice(0, 50)}"`;
  return String(v);
};

console.log('top-level keys:', Object.keys(raw));
console.log('data is array:', Array.isArray(data), 'len:', data.length);
console.log('\nZONE LIST:');
data.forEach((z, i) => {
  console.log(`  [${i}] key=${z.layout_key ?? z.zone_key ?? z.key ?? '?'} title=${JSON.stringify((z.layout_title || z.zone_title || z.title || '').slice(0, 40))}`);
});

const first = data.find(z => (z.product_list || z.list || z.products || z.data)?.length) || data[0];
console.log('\n=== first zone shape ===');
console.log(shape(first).slice(0, 3000));
