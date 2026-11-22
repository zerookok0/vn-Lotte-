import { chromium, devices } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.argv[2] || 'https://vn-lotte.mating.workers.dev';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ ...devices['iPhone 12'], locale: 'vi-VN' });
const p = await ctx.newPage();

await p.goto(BASE + '/vi-nsg/tp5/sinh-nhat-lotte', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(2600);
await p.evaluate(async () => {
  for (let y = 0; y < 4000; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); }
});

const rules = await p.evaluate(() => {
  const out = [];
  const target = [...document.querySelectorAll('.swiper-wrapper')].find((w) => w.querySelector('.field-more'));
  if (!target) return { error: 'no target' };

  for (const sheet of document.styleSheets) {
    let list;
    try { list = sheet.cssRules; } catch { continue; }
    const href = sheet.href || '(inline)';
    const walk = (rules, media) => {
      for (const r of rules) {
        if (r.type === CSSRule.MEDIA_RULE) { walk(r.cssRules, r.conditionText); continue; }
        if (r.type !== CSSRule.STYLE_RULE) continue;
        if (!/swiper-wrapper|swiper-slide|\.swiper\b/.test(r.selectorText || '')) continue;
        const cssText = r.style.cssText || '';
        if (/flex-wrap|flex-basis|width|overflow/.test(cssText)) {
          out.push({ href: href.split('/').pop(), media: media || '', sel: r.selectorText, decl: cssText.slice(0, 130) });
        }
      }
    };
    walk(list, '');
  }
  return { count: out.length, rules: out.slice(0, 25), viewport: window.innerWidth };
});

console.log(JSON.stringify(rules, null, 1).slice(0, 3000));

/* 实测：强制 nowrap 后是否变成一行 */
const test = await p.evaluate(() => {
  const w = [...document.querySelectorAll('.swiper-wrapper')].find((x) => x.querySelector('.field-more'));
  if (!w) return null;
  const before = { wrap: getComputedStyle(w).flexWrap, w: Math.round(w.getBoundingClientRect().width), h: Math.round(w.getBoundingClientRect().height) };
  w.style.flexWrap = 'nowrap';
  const after = { wrap: getComputedStyle(w).flexWrap, w: Math.round(w.getBoundingClientRect().width), h: Math.round(w.getBoundingClientRect().height) };
  const cards = [...w.querySelectorAll('.item')].slice(0, 3).map((c) => ({ x: Math.round(c.getBoundingClientRect().x), y: Math.round(c.getBoundingClientRect().y), w: Math.round(c.getBoundingClientRect().width) }));
  return { before, after, cards };
});
console.log('\n强制 nowrap 后:', JSON.stringify(test));

await browser.close();
