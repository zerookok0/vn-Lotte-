import { readFile } from 'node:fs/promises';

const h = await readFile('public/index.html', 'utf8');
const re = /<iframe\b[^>]*>/gi;
let m;
let i = 0;
while ((m = re.exec(h)) && i < 10) {
  console.log(`[${i++}]`, m[0].slice(0, 400));
  console.log('---');
}
console.log('total iframes:', (h.match(/<iframe\b/gi) || []).length);
