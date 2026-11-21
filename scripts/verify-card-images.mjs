import { chromium } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:8787';
const PAGES = [
  ['/vi-nsg/category/bot-an-dam-c731', 'bot-an-dam'],
  ['/vi-nsg/category/rau-cu-c3', 'rau-cu'],
  ['/', 'home'],
];

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

for (const [path, name] of PAGES) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
  const page = await ctx.newPage();
  const bad = [];
  page.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url().slice(-55)}`); });

  await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const o = document.getElementById('promo-overlay');
    if (o) o.remove();
    document.body.style.overflow = '';
  });
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 35)); }
    window.scrollTo(0, 500);
  });
  await page.waitForTimeout(1200);

  const info = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('img')];
    const broken = imgs.filter((i) => i.complete && i.naturalWidth === 0 && i.getAttribute('src'));
    // 商品卡里的占位 span 是否还有没背景图的
    const spans = [...document.querySelectorAll('a[href*="/vi-nsg/product/"] span')];
    const noBg = spans.filter((s) => !String(getComputedStyle(s).backgroundImage || '').includes('url('));
    return { imgs: imgs.length, broken: broken.length, spans: spans.length, noBg: noBg.length };
  });

  console.log(`${name.padEnd(12)} imgs=${info.imgs} broken=${info.broken} 商品图占位=${info.spans} 未填=${info.noBg} 404=${bad.length}`);
  if (bad.length) bad.slice(0, 3).forEach((b) => console.log('   ' + b));

  await page.screenshot({ path: `data/raw/shots/imgfix-${name}.png`, fullPage: false });
  await ctx.close();
}

await browser.close();
