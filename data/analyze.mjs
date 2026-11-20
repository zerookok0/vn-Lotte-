import { readFile } from 'node:fs/promises';

const h = await readFile('data/raw/pages/home.html', 'utf8');
const headStart = h.indexOf('<head>');
const headEnd = h.indexOf('</head>');
const head = h.slice(headStart, headEnd + 7);

console.log('--- HEAD (scripts stripped) ---');
console.log(head.replace(/<script[\s\S]*?<\/script>/g, '<!--SCRIPT-->').slice(0, 3000));

const count = (re) => (h.match(re) || []).length;
console.log('\n--- counts ---');
console.log('script tags      :', count(/<script/g));
console.log('stylesheet links :', count(/rel="stylesheet"/g));
console.log('data-src         :', count(/data-src=/g));
console.log('loading=lazy     :', count(/loading="lazy"/g));
console.log('iframe           :', count(/<iframe/g));
console.log('modal show       :', count(/modal show/g));
console.log('data-nextjs      :', count(/data-nextjs/g));
console.log('hardcoded host   :', count(/https:\/\/www\.lottemart\.vn/g));
console.log('third-party host :', count(/https:\/\/(?!www\.lottemart\.vn)[a-z0-9.-]+/gi));

console.log('\n--- body start (600 chars) ---');
const bodyStart = h.indexOf('<body');
console.log(h.slice(bodyStart, bodyStart + 900).replace(/></g, '>\n<'));

console.log('\n--- modal presence ---');
console.log('Chọn cửa hàng:', h.includes('Chọn cửa hàng'));
console.log('Đã hiểu (cookie):', h.includes('Đã hiểu'));
