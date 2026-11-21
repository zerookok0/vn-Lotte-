import { readFile } from 'node:fs/promises';

const cat = JSON.parse(await readFile('public/data/catalog.json', 'utf8'));
const cats = cat.categoriesFlat || cat.categories || [];
console.log(`分类总数: ${cats.length}`);

const want = [
  'Dầu ăn', 'Gia vị nêm', 'Gia vị hoàn chỉnh', 'Sốt / Gia vị các loại',
  'Nước mắm các loại', 'Nước tương',
  'Dầu đậu nành', 'Dầu hạt cải, hướng dương', 'Dầu oliu', 'Dầu mè', 'Dầu thực vật',
];

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

for (const w of want) {
  const exact = cats.filter((c) => norm(c.name) === norm(w));
  const loose = cats.filter((c) => norm(c.name).includes(norm(w)) || norm(w).includes(norm(c.name)));
  const pick = exact[0] || loose[0];
  console.log(
    `${w.padEnd(26)} exact=${exact.length} loose=${loose.length}  ->  ${pick ? pick.url + '  (' + pick.name + ')' : '未找到'}`,
  );
}

/* 顺便看所有含 "dầu" 的分类 */
console.log('\n=== 所有含 "dầu" 的分类 ===');
cats.filter((c) => norm(c.name).includes('dầu')).slice(0, 20).forEach((c) => console.log(`  ${c.name.padEnd(34)} ${c.url}`));

console.log('\n=== 所有含 "gia vị" 的分类 ===');
cats.filter((c) => norm(c.name).includes('gia vị')).slice(0, 20).forEach((c) => console.log(`  ${c.name.padEnd(34)} ${c.url}`));
