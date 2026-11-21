import { chromium } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ORIGIN = 'https://www.lottemart.vn';
const MINE = process.argv[2] || 'http://127.0.0.1:8787';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 }, locale: 'vi-VN',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
});

async function probe(url, label, needStore) {
  const p = await ctx.newPage();
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(2800);
  if (needStore) {
    try { await p.locator('div.modal.show button', { hasText: /Nam Sài Gòn|Gò Vấp/ }).first().click({ timeout: 2500 }); await p.waitForTimeout(600); } catch {}
  }
  await p.evaluate(() => {
    const o = document.getElementById('promo-overlay');
    if (o) o.remove();
    document.querySelectorAll('.modal-backdrop').forEach((b) => b.remove());
    document.body.style.overflow = '';
  });
  await p.waitForTimeout(800);

  const info = await p.evaluate(() => {
    const items = [...document.querySelectorAll('.item')].filter((el) => el.querySelector('.field-name'));
    const out = [];
    for (const el of items.slice(0, 3)) {
      const imgWrap = el.querySelector('.field-img .img') || el.querySelector('.field-img');
      const img = el.querySelector('img');
      const inner = imgWrap?.querySelector('img');
      const cs = imgWrap ? getComputedStyle(imgWrap) : null;
      out.push({
        name: (el.querySelector('.field-name')?.textContent || '').trim().slice(0, 28),
        wrapClass: imgWrap?.className?.toString?.().slice(0, 40) || '',
        wrapStyle: imgWrap?.getAttribute('style')?.slice(0, 120) || '',
        bgImage: cs ? cs.backgroundImage.slice(0, 90) : '',
        bgSize: cs ? cs.backgroundSize : '',
        imgTag: inner ? { src: (inner.getAttribute('src') || '').slice(-50), w: inner.naturalWidth, h: inner.naturalHeight, dispW: Math.round(inner.getBoundingClientRect().width), dispH: Math.round(inner.getBoundingClientRect().height) } : null,
        objectFit: inner ? getComputedStyle(inner).objectFit : '',
      });
    }
    return { count: items.length, items: out };
  });

  console.log(`\n### ${label} （${info.count} 张卡）###`);
  info.items.forEach((x, i) => console.log(`  [${i}] ${JSON.stringify(x, null, 0)}`));
  await p.close();
}

await probe(ORIGIN + '/', '原站首页', true);
await probe(MINE + '/', '克隆站首页', false);

/* 手机视口再看一次 */
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'vi-VN', isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' });
const mp = await mctx.newPage();
for (const [url, label] of [[ORIGIN + '/', '原站首页·移动'], [MINE + '/', '克隆站首页·移动']]) {
  await mp.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await mp.waitForTimeout(2800);
  try { await mp.locator('div.modal.show button', { hasText: /Nam Sài Gòn|Gò Vấp/ }).first().click({ timeout: 2000 }); } catch {}
  await mp.evaluate(() => { const o = document.getElementById('promo-overlay'); if (o) o.remove(); });
  await mp.waitForTimeout(600);
  const r = await mp.evaluate(() => {
    const el = [...document.querySelectorAll('.item')].find((x) => x.querySelector('.field-name'));
    if (!el) return null;
    const wrap = el.querySelector('.field-img .img') || el.querySelector('.field-img');
    const img = wrap?.querySelector('img');
    const cs = wrap ? getComputedStyle(wrap) : null;
    return {
      name: el.querySelector('.field-name')?.textContent?.trim().slice(0, 26),
      wrap: { cls: wrap?.className?.toString?.(), w: Math.round(wrap?.getBoundingClientRect().width || 0), h: Math.round(wrap?.getBoundingClientRect().height || 0), bgSize: cs?.backgroundSize, bgPos: cs?.backgroundPosition },
      img: img ? { natural: `${img.naturalWidth}x${img.naturalHeight}`, display: `${Math.round(img.getBoundingClientRect().width)}x${Math.round(img.getBoundingClientRect().height)}`, fit: getComputedStyle(img).objectFit } : null,
    };
  });
  console.log(`\n### ${label} ###\n  ${JSON.stringify(r)}`);
}
await mctx.close();

await browser.close();
