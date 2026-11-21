import { chromium, devices } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const MINE = process.argv[2] || 'http://127.0.0.1:8787';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

for (const [devName, dev] of [['iPhone 12', devices['iPhone 12']], ['Desktop', { viewport: { width: 1440, height: 900 } }]]) {
  const ctx = await browser.newContext({ ...dev, locale: 'vi-VN' });
  const p = await ctx.newPage();
  await p.goto(MINE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(2200);
  await p.evaluate(() => {
    const o = document.getElementById('promo-overlay');
    if (o) o.remove();
    document.body.style.overflow = '';
  });
  await p.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 150)); }
  });
  await p.waitForTimeout(1200);

  const info = await p.evaluate(() => {
    const cards = [...document.querySelectorAll('.item')].filter((el) => el.querySelector('.field-more'));
    if (!cards.length) return { found: false };

    const first = cards[0];
    let el = first;
    const chain = [];
    for (let i = 0; i < 5 && el; i++) {
      const cs = getComputedStyle(el);
      chain.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className || '').toString().slice(0, 55),
        display: cs.display,
        cols: (cs.gridTemplateColumns || '').slice(0, 60),
        flexWrap: cs.flexWrap,
        w: Math.round(el.getBoundingClientRect().width),
        kids: el.children.length,
      });
      el = el.parentElement;
    }

    const r0 = cards[0].getBoundingClientRect();
    const r1 = cards[1] ? cards[1].getBoundingClientRect() : null;
    const secondSameRow = r1 ? Math.abs(r0.y - r1.y) < 40 : false;
    const rowEl = cards[0].closest('.row') || (cards[0].parentElement ? cards[0].parentElement.parentElement : null);
    const rowW = rowEl ? rowEl.getBoundingClientRect().width : 0;

    return {
      found: true,
      cardCount: cards.length,
      firstCard: { w: Math.round(r0.width), x: Math.round(r0.x), y: Math.round(r0.y) },
      secondCard: r1 ? { w: Math.round(r1.width), x: Math.round(r1.x), y: Math.round(r1.y), sameRow: secondSameRow } : null,
      perRow: rowW && r0.width ? Math.max(1, Math.round(rowW / r0.width)) : 1,
      chain,
    };
  });

  console.log(`\n### ${devName} ###`);
  if (!info.found) { console.log('  没找到含 field-more 的商品卡'); await ctx.close(); continue; }
  console.log(`  卡片数 ${info.cardCount}  每行列数 ${info.perRow}`);
  console.log(`  第一张 ${JSON.stringify(info.firstCard)}`);
  console.log(`  第二张 ${JSON.stringify(info.secondCard)}`);
  console.log('  向上 5 层:');
  info.chain.forEach((c) => console.log(`    ${JSON.stringify(c)}`));

  await ctx.close();
}

await browser.close();
