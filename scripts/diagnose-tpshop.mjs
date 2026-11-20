import { chromium } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await chromium.launch({ executablePath: CHROME, headless: true });

for (const w of [1440, 2048]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, locale: 'vi-VN' });
  const page = await ctx.newPage();
  const fails = [];
  page.on('response', (r) => { if (r.status() >= 400) fails.push(`${r.status()} ${r.url().slice(-70)}`); });

  await page.goto('http://127.0.0.1:8787/vi-nsg/tp5/pet-shop', { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(1500);
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1200);

  const info = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('img')];
    const broken = imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.getAttribute('src')?.slice(-60));
    const noSrc = imgs.filter((i) => !i.getAttribute('src')).length;
    // 找高度大但没内容的块
    const emptyBig = [];
    document.querySelectorAll('div, section').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.height > 300 && r.width > 400 && !el.textContent.trim() && !el.querySelector('img')) {
        emptyBig.push({ cls: String(el.className).slice(0, 50), h: Math.round(r.height), w: Math.round(r.width) });
      }
    });
    const wraps = [...document.querySelectorAll('.swiper-wrapper')].slice(0, 4).map((w2) => ({
      transform: w2.style.transform,
      w: Math.round(w2.getBoundingClientRect().width),
      sw: w2.scrollWidth,
      kids: w2.children.length,
      firstKidW: w2.children[0] ? Math.round(w2.children[0].getBoundingClientRect().width) : 0,
    }));
    return {
      docW: document.documentElement.scrollWidth,
      docH: document.body.scrollHeight,
      imgCount: imgs.length,
      broken,
      noSrc,
      emptyBig: emptyBig.slice(0, 6),
      wraps,
    };
  });

  console.log(`\n=== viewport ${w} ===`);
  console.log(JSON.stringify(info, null, 1).slice(0, 2000));
  if (fails.length) console.log('404s:', fails.slice(0, 6));

  await page.screenshot({ path: `data/raw/shots/tpshop-${w}.png`, fullPage: false });
  await ctx.close();
}

await browser.close();
