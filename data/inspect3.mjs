import { readFile } from 'node:fs/promises';
const raw = JSON.parse(await readFile(new URL('./raw/homepage.json', import.meta.url), 'utf8'));
const data = raw.data;

const z = data.find(x => x.zone === 'today_check');
console.log('today_check title:', z.title_name, '| title_image:', z.title_image);
console.log('items:', z.items.length);
console.log('\n=== item[0] ===');
console.log(JSON.stringify(z.items[0], null, 2).slice(0, 4000));

const cats = JSON.parse(await readFile(new URL('./raw/categories.json', import.meta.url), 'utf8'));
const catRoot = cats.data;
console.log('\n=== categories ===');
console.log('is array:', Array.isArray(catRoot), 'len:', Array.isArray(catRoot) ? catRoot.length : Object.keys(catRoot));
const first = Array.isArray(catRoot) ? catRoot[0] : catRoot;
console.log(JSON.stringify(first, null, 2).slice(0, 1800));
