import { chromium } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ORIGIN = 'https://www.lottemart.vn';
const MINE = process.argv[2] || 'http://127.0.0.1:8787';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 }, locale: 'vi-VN',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
});

async function grab(url, label, needStore) {
  const p = await ctx.newPage();
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(2600);
  if (needStore) {
    try { await p.locator('div.modal.show button', { hasText: /Nam Sài Gòn|Gò Vấp/ }).first().click({ timeout: 2500 }); await p.waitForTimeout(700); } catch {}
  }
  await p.evaluate(() => {
    const o = document.getElementById('promo-overlay');
    if (o) o.remove();
    document.querySelectorAll('.modal-backdrop').forEach((b) => b.remove());
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
  });
  /* 滚到商品区触发懒加载 */
  await p.evaluate(async () => {
    for (let y = 0; y < 4000; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 220)); }
    window.scrollTo(0, 1200);
  });
  await p.waitForTimeout(2000);

  const info = await p.evaluate(() => {
    const card = [...document.querySelectorAll('.item')].find((el) => el.querySelector('.field-name') && el.querySelector('.field-img'));
    if (!card) return null;
    const html = card.querySelector('.field-img').outerHTML.slice(0, 900);

    /* 深度找第一张真实图片节点 */
    let imgNode = card.querySelector('.field-img img');
    let bgNode = null;
    card.querySelectorAll('.field-img *').forEach((el) => {
      const b = getComputedStyle(el).backgroundImage;
      if (b && b !== 'none' && !bgNode) bgNode = el;
    });
    const rect = (el) => el ? { w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) } : null;

    return {
      name: (card.querySelector('.field-name')?.textContent || '').trim().slice(0, 30),
      fieldImgHtml: html,
      img: imgNode ? {
        src: (imgNode.getAttribute('src') || '').slice(-70),
        natural: `${imgNode.naturalWidth}x${imgNode.naturalHeight}`,
        display: rect(imgNode),
        objectFit: getComputedStyle(imgNode).objectFit,
        objectPosition: getComputedStyle(imgNode).objectPosition,
      } : null,
      bg: bgNode ? {
        cls: bgNode.className?.toString?.().slice(0, 40),
        image: getComputedStyle(bgNode).backgroundImage.slice(-80),
        size: getComputedStyle(bgNode).backgroundSize,
        position: getComputedStyle(bgNode).backgroundPosition,
        repeat: getComputedStyle(bgNode).backgroundRepeat,
        display: rect(bgNode),
      } : null,
    };
  });

  console.log(`\n########## ${label} ##########`);
  if (!info) { console.log('  没找到商品卡'); await p.close(); return; }
  console.log(`  商品: ${info.name}`);
  console.log(`  img: ${JSON.stringify(info.img)}`);
  console.log(`  bg : ${JSON.stringify(info.bg)}`);
  console.log(`  field-img HTML: ${info.fieldImgHtml.slice(0, 600)}`);
  await p.screenshot({ path: `data/raw/shots/imgcmp-${label.replace(/[^\w]/g, '')}.png`, clip: { x: 100, y: 900, width: 500, height: 500 } }).catch(() => {});
  await p.close();
}

await grab(ORIGIN + '/', 'origin', true);
await grab(MINE + '/', 'clone', false);

await browser.close();
