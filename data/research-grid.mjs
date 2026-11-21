import { chromium, devices } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ORIGIN = 'https://www.lottemart.vn';
const MINE = process.argv[2] || 'http://127.0.0.1:8787';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

for (const [devName, dev] of [['iPhone 12', devices['iPhone 12']], ['Desktop', { viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false }]]) {
  console.log(`\n########## ${devName} ##########`);
  for (const [url, label] of [[ORIGIN + '/', 'origin'], [MINE + '/', 'clone']]) {
    const ctx = await browser.newContext({ ...dev, locale: 'vi-VN' });
    const p = await ctx.newPage();
    try {
      await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await p.waitForTimeout(2800);
      try { await p.locator('div.modal.show button', { hasText: /Nam Sài Gòn|Gò Vấp/ }).first().click({ timeout: 2500 }); } catch {}
      await p.evaluate(() => {
        const o = document.getElementById('promo-overlay');
        if (o) o.remove();
        document.querySelectorAll('.modal-backdrop').forEach((b) => b.remove());
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
      });
      await p.evaluate(async () => {
        for (let y = 0; y < 3000; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 200)); }
      });
      await p.waitForTimeout(1800);

      const info = await p.evaluate(() => {
        /* 找一个含多个商品卡的网格容器 */
        const cards = [...document.querySelectorAll('.item')].filter((el) => el.querySelector('.field-name'));
        if (!cards.length) return { cards: 0 };
        const first = cards[0];
        /* 向上找最近的「多子元素且水平排列」的容器 */
        let grid = null, el = first.parentElement;
        for (let i = 0; i < 6 && el; i++) {
          const cs = getComputedStyle(el);
          const kids = [...el.children].filter((c) => c.querySelector?.('.field-name') || c.className?.toString?.().includes('col'));
          if (kids.length >= 2) {
            const r0 = kids[0].getBoundingClientRect();
            const r1 = kids[1].getBoundingClientRect();
            const sameRow = Math.abs(r0.top - r1.top) < 30;
            grid = {
              cls: el.className?.toString?.().slice(0, 60),
              display: cs.display,
              gridCols: cs.gridTemplateColumns?.slice(0, 80),
              flexWrap: cs.flexWrap,
              kids: kids.length,
              sameRow,
              cardW: Math.round(r0.width),
              gap: Math.round(r1.left - r0.right),
              containerW: Math.round(el.getBoundingClientRect().width),
            };
            if (kids.length >= 2) break;
          }
          el = el.parentElement;
        }
        return { cards: cards.length, grid };
      });
      console.log(`  ${label.padEnd(7)} 商品卡 ${String(info.cards).padStart(2)}  网格 ${JSON.stringify(info.grid)}`);
    } catch (e) {
      console.log(`  ${label} ERR ${String(e).slice(0, 60)}`);
    } finally {
      await ctx.close();
    }
  }
}

await browser.close();
